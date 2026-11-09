//! GET /github/activity: atividade pessoal do usuário via GraphQL (não usa o REST /events).
use super::{authentication::gh_call, contributions::{parse_range, RangeQuery}, with_mock};
use crate::{auth::AuthUser, error::{ApiError, ApiResult}, state::AppState};
use axum::{extract::{Query, State}, Json};
use serde::Deserialize;
use serde_json::{json, Value};

const TYPES: [&str; 5] = ["commit", "pull_request", "review", "issue", "repository"];

#[derive(Deserialize)]
pub struct ActivityQuery {
    from: Option<String>,
    to: Option<String>,
    types: Option<String>,
    limit: Option<usize>,
}

pub async fn get(State(s): State<AppState>, u: AuthUser, Query(q): Query<ActivityQuery>) -> ApiResult<Json<Value>> {
    // Padrão de 30 dias: a atividade é uma lista, não um calendário.
    let (from, to) = parse_range(&RangeQuery { from: q.from.clone(), to: q.to.clone() }, 30)?;
    let types: Vec<String> = match q.types.as_deref().filter(|t| !t.is_empty()) {
        Some(t) => t.split(',').map(|x| x.trim().to_string()).collect(),
        None => TYPES.iter().map(|t| t.to_string()).collect(),
    };
    if let Some(bad) = types.iter().find(|t| !TYPES.contains(&t.as_str())) {
        return Err(ApiError::BadRequest(format!("types: '{bad}' inválido (use {})", TYPES.join(","))));
    }
    let limit = q.limit.unwrap_or(100).clamp(1, 200);

    let gh = s.github.clone();
    let (f, t) = (from.clone(), to.clone());
    let data = gh_call(&s, &u.id, |tok| async move { gh.activity(&tok, &f, &t).await }).await?;

    let mut items: Vec<_> = data.items.into_iter().filter(|i| types.contains(&i.kind)).collect();
    items.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at).then_with(|| b.id.cmp(&a.id)));
    let truncated = data.truncated || items.len() > limit;
    items.truncate(limit);
    with_mock(&s, json!({ "from": from, "to": to, "truncated": truncated, "items": items }))
}
