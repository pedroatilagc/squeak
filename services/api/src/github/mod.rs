//! Integração GitHub, em camadas: `domain` (tipos puros) -> `client` (GitHub real/mock) -> `store` (SQL)
//! -> handlers por área. Tokens só existem em memória durante uma chamada; no banco ficam cifrados.
pub mod authentication;
pub mod client;
pub mod contributions;
pub mod crypto;
pub mod developer_activity;
pub mod domain;
pub mod events;
pub mod profile;
pub mod pull_requests;
pub mod repositories;
pub mod store;
pub mod time;
pub mod webhooks;

use crate::{error::{ApiError, ApiResult}, state::AppState};
use axum::{http::StatusCode, Json};
use client::GhError;
use serde::Serialize;
use serde_json::Value;

pub fn unconfigured() -> ApiError {
    ApiError::Coded(StatusCode::SERVICE_UNAVAILABLE, "github_unconfigured", "integração com o GitHub não configurada".into())
}

pub fn disconnected() -> ApiError {
    ApiError::Coded(StatusCode::CONFLICT, "github_disconnected", "conecte sua conta do GitHub primeiro".into())
}

pub fn reauth_required() -> ApiError {
    ApiError::Coded(StatusCode::CONFLICT, "github_reauth_required", "reconecte sua conta do GitHub".into())
}

/// Mapeia erros do GitHub para respostas estáveis, sem detalhes internos.
pub fn map_gh_error(e: GhError) -> ApiError {
    match e {
        GhError::Unauthorized => reauth_required(),
        GhError::RateLimited => {
            ApiError::Coded(StatusCode::TOO_MANY_REQUESTS, "github_rate_limited", "limite de requisições do GitHub atingido".into())
        }
        GhError::NotFound => ApiError::NotFound,
        GhError::Upstream => {
            ApiError::Coded(StatusCode::BAD_GATEWAY, "github_upstream", "falha ao consultar o GitHub".into())
        }
    }
}

/// Credenciais completas (ou mock). Sem isso as rotas de dados respondem 503.
pub fn is_configured(s: &AppState) -> bool {
    let g = &s.cfg.github;
    s.github.is_mock() || (!g.client_id.is_empty() && !g.client_secret.is_empty() && s.cipher.is_some())
}

pub fn ensure_configured(s: &AppState) -> ApiResult<()> {
    if is_configured(s) { Ok(()) } else { Err(unconfigured()) }
}

/// Serializa a resposta e acrescenta `"mock": true|false` conforme o cliente que a produziu.
pub fn with_mock(s: &AppState, data: impl Serialize) -> ApiResult<Json<Value>> {
    let mut v = serde_json::to_value(data).map_err(|e| ApiError::Internal(e.to_string()))?;
    if let Value::Object(m) = &mut v {
        m.insert("mock".into(), Value::Bool(s.github.is_mock()));
    }
    Ok(Json(v))
}

pub fn install_url(s: &AppState) -> Option<String> {
    let slug = &s.cfg.github.app_slug;
    (!slug.is_empty()).then(|| format!("https://github.com/apps/{slug}/installations/new"))
}
