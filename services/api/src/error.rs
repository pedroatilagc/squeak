use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("não autenticado")]
    Unauthorized,
    #[error("sem permissão")]
    Forbidden,
    #[error("não encontrado")]
    NotFound,
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Conflict(String),
    #[error("muitas tentativas, aguarde")]
    TooManyRequests,
    #[error("erro interno")]
    Internal(String),
    /// Erro com código estável para o cliente: `{ "error": msg, "code": code }`.
    #[error("{2}")]
    Coded(StatusCode, &'static str, String),
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!("db: {e}");
        ApiError::Internal(e.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match &self {
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::Forbidden => StatusCode::FORBIDDEN,
            ApiError::NotFound => StatusCode::NOT_FOUND,
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Conflict(_) => StatusCode::CONFLICT,
            ApiError::TooManyRequests => StatusCode::TOO_MANY_REQUESTS,
            ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ApiError::Coded(st, _, _) => *st,
        };
        // Detalhes internos nunca vão ao cliente.
        let msg = if matches!(self, ApiError::Internal(_)) { "erro interno".to_string() } else { self.to_string() };
        let body = match &self {
            ApiError::Coded(_, code, _) => json!({ "error": msg, "code": code }),
            _ => json!({ "error": msg }),
        };
        (status, Json(body)).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
