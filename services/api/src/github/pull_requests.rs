//! PRs do usuário (GraphQL) e PRs do servidor (montados só do que chegou por webhook).
use super::{
    authentication::gh_call,
    client::PrRole,
    domain::*,
    store,
    with_mock,
};
use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    servers::require_member,
    state::AppState,
};
use axum::{extract::{Path, Query, State}, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct MineQuery {
    role: Option<String>,
}

pub async fn mine(State(s): State<AppState>, u: AuthUser, Query(q): Query<MineQuery>) -> ApiResult<Json<Value>> {
    let role = match q.role.as_deref().unwrap_or("authored") {
        "authored" => PrRole::Authored,
        "review_requested" => PrRole::ReviewRequested,
        _ => return Err(ApiError::BadRequest("role: use authored ou review_requested".into())),
    };
    let gh = s.github.clone();
    let mut items = gh_call(&s, &u.id, |t| async move { gh.pull_requests(&t, role).await }).await?;
    items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    items.truncate(50);
    with_mock(&s, json!({ "items": items }))
}

#[derive(Deserialize)]
pub struct ServerQuery {
    state: Option<String>,
}

pub async fn server(
    State(s): State<AppState>,
    u: AuthUser,
    Path(id): Path<String>,
    Query(q): Query<ServerQuery>,
) -> ApiResult<Json<Value>> {
    require_member(&s, &id, &u.id).await?;
    let filter = q.state.as_deref().filter(|f| !f.is_empty());
    if let Some(f) = filter {
        if !PR_STATE_FILTERS.contains(&f) {
            return Err(ApiError::BadRequest(format!("state: use {}", PR_STATE_FILTERS.join("|"))));
        }
    }
    let prs = store::server_prs(&s.db, &id).await?;
    let mut reviews: HashMap<(i64, i64), Vec<Reviewer>> = HashMap::new();
    for r in store::server_reviews(&s.db, &id).await? {
        reviews.entry((r.repo_id, r.number)).or_default().push(Reviewer {
            login: r.reviewer_login,
            avatar_url: r.reviewer_avatar,
            state: r.state,
        });
    }
    let mut checks: HashMap<(i64, String), Vec<CheckInput>> = HashMap::new();
    for c in store::server_checks(&s.db, &id).await? {
        checks.entry((c.repo_id, c.head_sha)).or_default().push(CheckInput {
            source: c.source,
            name: c.name,
            status: c.status,
            conclusion: c.conclusion,
        });
    }
    let mut items: Vec<PullRequestCard> = prs
        .into_iter()
        .map(|p| {
            let reviewers = reviews.remove(&(p.repo_id, p.number)).unwrap_or_default();
            let summary = aggregate_checks(checks.get(&(p.repo_id, p.head_sha.clone())).map(Vec::as_slice).unwrap_or(&[]));
            PullRequestCard {
                id: if p.node_id.is_empty() { format!("{}#{}", p.repo_full_name, p.number) } else { p.node_id },
                number: p.number,
                title: p.title,
                url: p.url,
                repo: p.repo_full_name,
                author: Actor { login: p.author_login, avatar_url: p.author_avatar },
                head_ref: p.head_ref,
                base_ref: p.base_ref,
                state: p.state,
                is_draft: p.is_draft,
                review_status: derive_review_status(&reviewers),
                approvals: count_approvals(&reviewers),
                reviewers,
                checks: summary,
                created_at: p.created_at,
                updated_at: p.updated_at,
            }
        })
        .filter(|c| filter.is_none_or(|f| matches_state_filter(c, f)))
        .collect();
    items.truncate(100);
    Ok(Json(json!({ "items": items })))
}
