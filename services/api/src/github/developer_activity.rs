//! GET /servers/{id}/activity: feed de atividade do servidor (eventos do GitHub + eventos do próprio Squak).
use super::{domain::{FeedActor, FeedItem}, store};
use crate::{auth::AuthUser, error::{ApiError, ApiResult}, servers::require_member, state::AppState};
use axum::{extract::{Path, Query, State}, Json};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
pub struct FeedQuery {
    actor: Option<String>,
    repo: Option<String>,
    kind: Option<String>,
    before: Option<String>,
    limit: Option<i64>,
}

/// Cursor opaco = base64url("occurred_at\nid"): ordem estável (occurred_at DESC, id DESC), sem OFFSET.
fn encode_cursor(occurred_at: &str, id: &str) -> String {
    URL_SAFE_NO_PAD.encode(format!("{occurred_at}\n{id}"))
}

fn decode_cursor(c: &str) -> Option<(String, String)> {
    let raw = String::from_utf8(URL_SAFE_NO_PAD.decode(c).ok()?).ok()?;
    let (at, id) = raw.split_once('\n')?;
    // Cursor forjado não entra no SQL como estrutura (é só valor bindado), mas precisa ter cara de data.
    super::time::parse_iso(at)?;
    Some((at.to_string(), id.to_string()))
}

fn non_empty(v: Option<String>) -> Option<String> {
    v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

pub async fn feed(
    State(s): State<AppState>,
    u: AuthUser,
    Path(id): Path<String>,
    Query(q): Query<FeedQuery>,
) -> ApiResult<Json<Value>> {
    require_member(&s, &id, &u.id).await?;
    let limit = q.limit.unwrap_or(50).clamp(1, 100);
    let before = match non_empty(q.before) {
        Some(c) => Some(decode_cursor(&c).ok_or_else(|| ApiError::BadRequest("before: cursor inválido".into()))?),
        None => None,
    };
    let filter = store::FeedFilter { actor: non_empty(q.actor), repo: non_empty(q.repo), kind: non_empty(q.kind), before };
    let mut rows = store::feed(&s.db, &id, &filter, limit + 1).await?;
    let has_more = rows.len() as i64 > limit;
    rows.truncate(limit as usize);
    let next_before = if has_more { rows.last().map(|r| encode_cursor(&r.occurred_at, &r.id)) } else { None };

    let items: Vec<FeedItem> = rows
        .into_iter()
        .map(|r| FeedItem {
            id: r.id,
            source: r.source,
            kind: r.kind,
            action: r.action,
            actor: FeedActor { name: r.actor_name, avatar_url: r.actor_avatar, user_id: r.actor_user_id },
            title: r.title,
            repo: r.repo,
            url: r.url,
            occurred_at: r.occurred_at,
            detail: r.detail_json.and_then(|j| serde_json::from_str::<Value>(&j).ok()).filter(|v| !v.is_null()),
        })
        .collect();

    let (actors, repos, kinds) = store::feed_filter_values(&s.db, &id).await?;
    Ok(Json(json!({
        "items": items,
        "next_before": next_before,
        "filters": { "actors": actors, "repos": repos, "kinds": kinds },
    })))
}
