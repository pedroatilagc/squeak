//! Conexão da conta GitHub: device flow, renovação do token, desconexão e estado `reauth_required`.
use super::{
    client::{DevicePoll, GhError, TokenSet},
    crypto::TokenCipher,
    disconnected, ensure_configured, install_url, is_configured, map_gh_error, reauth_required, store,
};
use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    integrations::{IntegrationProvider, ProviderStatus},
    now_ms,
    state::AppState,
};
use async_trait::async_trait;
use axum::{extract::State, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use std::future::Future;

/// Renova o token com folga: 60 s antes de expirar.
const REFRESH_MARGIN_MS: i64 = 60_000;

fn cipher(s: &AppState) -> ApiResult<&TokenCipher> {
    s.cipher.as_deref().ok_or_else(super::unconfigured)
}

fn enc(c: &TokenCipher, plain: &str) -> ApiResult<String> {
    c.encrypt(plain).map_err(|_| ApiError::Internal("falha ao cifrar token".into()))
}

fn expiry(secs: Option<i64>) -> Option<i64> {
    secs.map(|n| now_ms() + n * 1000)
}

/// Token de acesso válido do usuário (renova se necessário). Nunca devolve token de conta em `reauth_required`.
pub async fn access_token(s: &AppState, user_id: &str) -> ApiResult<String> {
    ensure_configured(s)?;
    let c = cipher(s)?;
    let acc = store::get_account(&s.db, user_id).await?.ok_or_else(disconnected)?;
    if acc.status == "reauth_required" {
        return Err(reauth_required());
    }
    let fresh = |a: &store::AccountRow| a.access_expires_at.is_none_or(|t| t > now_ms() + REFRESH_MARGIN_MS);
    if fresh(&acc) {
        return c.decrypt(&acc.access_token_enc).map_err(|_| ApiError::Internal("token ilegível".into()));
    }

    // Refresh tokens são de uso único: uma renovação por vez, relendo o estado depois de esperar.
    let _guard = s.github_refresh.lock().await;
    let acc = store::get_account(&s.db, user_id).await?.ok_or_else(disconnected)?;
    if acc.status == "reauth_required" {
        return Err(reauth_required());
    }
    if fresh(&acc) {
        return c.decrypt(&acc.access_token_enc).map_err(|_| ApiError::Internal("token ilegível".into()));
    }
    let refresh = match (&acc.refresh_token_enc, acc.refresh_expires_at) {
        (Some(r), exp) if exp.is_none_or(|t| t > now_ms()) => c.decrypt(r).ok(),
        _ => None,
    };
    let Some(refresh) = refresh else {
        store::set_status(&s.db, user_id, "reauth_required").await?;
        return Err(reauth_required());
    };
    match s.github.refresh(&refresh).await {
        Ok(t) => {
            let access_enc = enc(c, &t.access_token)?;
            let refresh_enc = t.refresh_token.as_deref().map(|r| enc(c, r)).transpose()?;
            store::update_tokens(
                &s.db,
                user_id,
                &access_enc,
                refresh_enc.as_deref(),
                expiry(t.expires_in),
                expiry(t.refresh_token_expires_in),
            )
            .await?;
            Ok(t.access_token)
        }
        Err(GhError::Unauthorized) => {
            store::set_status(&s.db, user_id, "reauth_required").await?;
            Err(reauth_required())
        }
        Err(e) => Err(map_gh_error(e)),
    }
}

/// Executa uma chamada ao GitHub com o token do usuário; 401 marca a conta como `reauth_required`.
pub async fn gh_call<T, F, Fut>(s: &AppState, user_id: &str, f: F) -> ApiResult<T>
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = Result<T, GhError>>,
{
    let token = access_token(s, user_id).await?;
    match f(token).await {
        Ok(v) => Ok(v),
        Err(GhError::Unauthorized) => {
            store::set_status(&s.db, user_id, "reauth_required").await?;
            Err(reauth_required())
        }
        Err(e) => Err(map_gh_error(e)),
    }
}

pub async fn device_start(State(s): State<AppState>, u: AuthUser) -> ApiResult<Json<Value>> {
    ensure_configured(&s)?;
    let c = cipher(&s)?;
    let d = s.github.device_start().await.map_err(map_gh_error)?;
    let flow_id = store::insert_flow(
        &s.db,
        &u.id,
        &enc(c, &d.device_code)?,
        &d.user_code,
        now_ms() + d.expires_in * 1000,
        d.interval,
    )
    .await?;
    Ok(Json(json!({
        "flow_id": flow_id, "user_code": d.user_code, "verification_uri": d.verification_uri,
        "expires_in": d.expires_in, "interval": d.interval
    })))
}

#[derive(Deserialize)]
pub struct PollBody {
    flow_id: String,
}

pub async fn device_poll(State(s): State<AppState>, u: AuthUser, Json(b): Json<PollBody>) -> ApiResult<Json<Value>> {
    ensure_configured(&s)?;
    let c = cipher(&s)?;
    let flow = store::get_flow(&s.db, &b.flow_id, &u.id).await?.ok_or(ApiError::NotFound)?;
    if flow.expires_at <= now_ms() {
        store::delete_flow(&s.db, &flow.flow_id).await?;
        return Ok(Json(json!({ "status": "expired" })));
    }
    let device_code = c.decrypt(&flow.device_code_enc).map_err(|_| ApiError::Internal("código ilegível".into()))?;
    match s.github.device_poll(&device_code).await.map_err(map_gh_error)? {
        DevicePoll::Pending => Ok(Json(json!({ "status": "pending", "interval": flow.interval_s }))),
        DevicePoll::SlowDown { interval } => {
            let next = interval.unwrap_or(flow.interval_s + 5).max(flow.interval_s + 5);
            store::set_flow_interval(&s.db, &flow.flow_id, next).await?;
            Ok(Json(json!({ "status": "slow_down", "interval": next })))
        }
        DevicePoll::Denied => {
            store::delete_flow(&s.db, &flow.flow_id).await?;
            Ok(Json(json!({ "status": "denied" })))
        }
        DevicePoll::Expired => {
            store::delete_flow(&s.db, &flow.flow_id).await?;
            Ok(Json(json!({ "status": "expired" })))
        }
        DevicePoll::Connected(t) => {
            save_connection(&s, c, &u.id, t).await?;
            store::delete_flow(&s.db, &flow.flow_id).await?;
            Ok(Json(json!({ "status": "connected" })))
        }
    }
}

async fn save_connection(s: &AppState, c: &TokenCipher, user_id: &str, t: TokenSet) -> ApiResult<()> {
    let viewer = s.github.viewer(&t.access_token).await.map_err(map_gh_error)?;
    let row = store::AccountRow {
        user_id: user_id.into(),
        github_id: viewer.id,
        login: viewer.login,
        avatar_url: viewer.avatar_url,
        access_token_enc: enc(c, &t.access_token)?,
        refresh_token_enc: t.refresh_token.as_deref().map(|r| enc(c, r)).transpose()?,
        access_expires_at: expiry(t.expires_in),
        refresh_expires_at: expiry(t.refresh_token_expires_in),
        status: "connected".into(),
    };
    store::upsert_account(&s.db, &row).await
}

/// Desconecta: revoga no GitHub (best-effort) e apaga os tokens locais. Idempotente.
pub async fn disconnect_user(s: &AppState, user_id: &str) -> ApiResult<()> {
    if let Some(acc) = store::get_account(&s.db, user_id).await? {
        if let Some(Ok(token)) = s.cipher.as_ref().map(|c| c.decrypt(&acc.access_token_enc)) {
            if is_configured(s) && s.github.revoke(&token).await.is_err() {
                tracing::warn!("github: não foi possível revogar a autorização (seguindo com a remoção local)");
            }
        }
    }
    store::delete_account(&s.db, user_id).await
}

pub async fn disconnect(State(s): State<AppState>, u: AuthUser) -> ApiResult<Json<Value>> {
    disconnect_user(&s, &u.id).await?;
    Ok(Json(json!({ "ok": true })))
}

pub struct GitHubProvider;

#[async_trait]
impl IntegrationProvider for GitHubProvider {
    fn id(&self) -> &'static str {
        "github"
    }
    fn display_name(&self) -> &'static str {
        "GitHub"
    }
    fn permissions_note(&self) -> &'static str {
        "Somente leitura: perfil e contribuições públicas, atividade e PRs. Nada é escrito no GitHub."
    }
    async fn status(&self, s: &AppState, user_id: &str) -> ApiResult<ProviderStatus> {
        let account = store::get_account(&s.db, user_id).await?;
        let status = match (&account, is_configured(s)) {
            (_, false) => "unconfigured",
            (Some(a), true) if a.status == "reauth_required" => "reauth_required",
            (Some(_), true) => "connected",
            (None, true) => "disconnected",
        };
        Ok(ProviderStatus {
            status,
            mock: s.github.is_mock(),
            account: account.map(|a| json!({ "login": a.login, "avatar_url": a.avatar_url })),
            app_slug: Some(s.cfg.github.app_slug.clone()).filter(|v| !v.is_empty()),
            install_url: install_url(s),
        })
    }
    async fn connect(&self, s: &AppState, user_id: &str) -> ApiResult<Value> {
        let _ = (s, user_id);
        // A conexão é um fluxo em duas etapas (POST /integrations/github/device e /poll).
        Err(ApiError::BadRequest("use POST /integrations/github/device".into()))
    }
    async fn disconnect(&self, s: &AppState, user_id: &str) -> ApiResult<()> {
        disconnect_user(s, user_id).await
    }
}
