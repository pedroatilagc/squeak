//! Registro de provedores de integração. GitHub implementa o trait; Jira só declara o contrato futuro.
use crate::{auth::AuthUser, error::{ApiError, ApiResult}, github::authentication::GitHubProvider, state::AppState};
use async_trait::async_trait;
use axum::{extract::State, http::StatusCode, Json};
use serde_json::{json, Value};

pub struct ProviderStatus {
    /// `unconfigured | disconnected | connected | reauth_required | planned`
    pub status: &'static str,
    pub mock: bool,
    pub account: Option<Value>,
    pub app_slug: Option<String>,
    pub install_url: Option<String>,
}

#[async_trait]
pub trait IntegrationProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    /// Texto curto sobre o que a integração lê.
    fn permissions_note(&self) -> &'static str;
    async fn status(&self, s: &AppState, user_id: &str) -> ApiResult<ProviderStatus>;
    async fn connect(&self, s: &AppState, user_id: &str) -> ApiResult<Value>;
    async fn disconnect(&self, s: &AppState, user_id: &str) -> ApiResult<()>;
}

/// Contrato futuro (docs/INTEGRATIONS.md). Não chama o Jira.
pub struct JiraProvider;

#[async_trait]
impl IntegrationProvider for JiraProvider {
    fn id(&self) -> &'static str {
        "jira"
    }
    fn display_name(&self) -> &'static str {
        "Jira"
    }
    fn permissions_note(&self) -> &'static str {
        "Atlassian OAuth 2.0 (3LO) – ainda não implementado"
    }
    async fn status(&self, _s: &AppState, _user_id: &str) -> ApiResult<ProviderStatus> {
        Ok(ProviderStatus { status: "planned", mock: false, account: None, app_slug: None, install_url: None })
    }
    async fn connect(&self, _s: &AppState, _user_id: &str) -> ApiResult<Value> {
        Err(planned())
    }
    async fn disconnect(&self, _s: &AppState, _user_id: &str) -> ApiResult<()> {
        Err(planned())
    }
}

fn planned() -> ApiError {
    ApiError::Coded(StatusCode::NOT_IMPLEMENTED, "integration_planned", "integração ainda não implementada".into())
}

pub fn registry() -> Vec<Box<dyn IntegrationProvider>> {
    vec![Box::new(GitHubProvider), Box::new(JiraProvider)]
}

pub async fn list(State(s): State<AppState>, u: AuthUser) -> ApiResult<Json<Value>> {
    let mut items = Vec::new();
    for p in registry() {
        let st = p.status(&s, &u.id).await?;
        items.push(json!({
            "provider": p.id(), "name": p.display_name(), "status": st.status, "mock": st.mock,
            "account": st.account, "app_slug": st.app_slug, "install_url": st.install_url,
            "permissions_note": p.permissions_note(),
        }));
    }
    Ok(Json(json!({ "integrations": items })))
}
