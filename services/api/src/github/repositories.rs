//! Instalações da GitHub App, repositórios visíveis ao usuário e vínculo servidor <-> repositório.
use super::{
    authentication::gh_call,
    ensure_configured, install_url, is_configured, store, with_mock,
};
use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    servers::{require_admin, require_member},
    state::AppState,
};
use axum::{extract::{Path, State}, Json};
use serde::Deserialize;
use serde_json::{json, Value};

const MAX_REPOS_PER_LINK: usize = 100;

pub async fn installations(State(s): State<AppState>, u: AuthUser) -> ApiResult<Json<Value>> {
    let gh = s.github.clone();
    let items = gh_call(&s, &u.id, |t| async move { gh.installations(&t).await }).await?;
    with_mock(&s, json!({ "items": items }))
}

pub async fn installation_repos(State(s): State<AppState>, u: AuthUser, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let gh = s.github.clone();
    // Instalação que o usuário não enxerga: 404 do GitHub vira NotFound (não revela se existe).
    let items = gh_call(&s, &u.id, |t| async move { gh.installation_repositories(&t, id).await }).await?;
    Ok(Json(json!({ "items": items })))
}

async fn links_response(s: &AppState, server_id: &str, role: &str) -> ApiResult<Json<Value>> {
    let links = store::list_links(&s.db, server_id).await?;
    Ok(Json(json!({
        "configured": is_configured(s),
        "mock": s.github.is_mock(),
        "can_manage": role == "owner" || role == "admin",
        "install_url": install_url(s),
        "links": links.into_iter().map(|l| json!({
            "id": l.id, "installation_id": l.installation_id, "repo_id": l.repo_id,
            "repo_full_name": l.repo_full_name, "activity_channel_id": l.activity_channel_id,
        })).collect::<Vec<_>>(),
    })))
}

pub async fn server_links(State(s): State<AppState>, u: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let role = require_member(&s, &id, &u.id).await?;
    links_response(&s, &id, &role).await
}

#[derive(Deserialize)]
pub struct RepoRef {
    id: i64,
    #[allow(dead_code)] // o nome vem do GitHub (token do usuário), não do cliente
    full_name: Option<String>,
}

#[derive(Deserialize)]
pub struct PutBody {
    installation_id: i64,
    repos: Vec<RepoRef>,
    activity_channel_id: Option<String>,
}

pub async fn put_repos(
    State(s): State<AppState>,
    u: AuthUser,
    Path(id): Path<String>,
    Json(b): Json<PutBody>,
) -> ApiResult<Json<Value>> {
    let role = require_admin(&s, &id, &u.id).await?;
    ensure_configured(&s)?;
    if b.repos.len() > MAX_REPOS_PER_LINK {
        return Err(ApiError::BadRequest(format!("no máximo {MAX_REPOS_PER_LINK} repositórios por vez")));
    }
    if let Some(ch) = b.activity_channel_id.as_deref() {
        match store::channel_server_and_kind(&s.db, ch).await? {
            Some((sid, kind)) if sid == id && kind == "text" => {}
            _ => return Err(ApiError::BadRequest("activity_channel_id deve ser um canal de texto deste servidor".into())),
        }
    }

    // Só vincula o que o token DO USUÁRIO enxerga; nome e visibilidade vêm do GitHub.
    let gh = s.github.clone();
    let installation_id = b.installation_id;
    let visible = match gh_call(&s, &u.id, |t| async move { gh.installation_repositories(&t, installation_id).await }).await {
        Ok(v) => v,
        Err(ApiError::NotFound) => return Err(ApiError::Forbidden),
        Err(e) => return Err(e),
    };
    let mut chosen: Vec<(i64, String)> = Vec::new();
    for r in &b.repos {
        let found = visible.iter().find(|v| v.id == r.id).ok_or(ApiError::Forbidden)?;
        if !chosen.iter().any(|c| c.0 == found.id) {
            chosen.push((found.id, found.full_name.clone()));
        }
    }
    store::replace_links(&s.db, &id, installation_id, &chosen, b.activity_channel_id.as_deref(), &u.id).await?;
    links_response(&s, &id, &role).await
}

pub async fn delete_link(
    State(s): State<AppState>,
    u: AuthUser,
    Path((id, link_id)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    require_admin(&s, &id, &u.id).await?;
    if !store::delete_link(&s.db, &id, &link_id).await? {
        return Err(ApiError::NotFound);
    }
    Ok(Json(json!({ "ok": true })))
}
