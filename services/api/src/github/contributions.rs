//! GET /github/contributions e o parse do intervalo `from`/`to` (compartilhado com a atividade pessoal).
use super::{
    authentication::gh_call,
    time::{fmt_secs, now_secs, parse_iso},
    with_mock,
};
use crate::{auth::AuthUser, error::{ApiError, ApiResult}, state::AppState};
use axum::{extract::{Query, State}, Json};
use serde::Deserialize;
use serde_json::Value;

/// O GraphQL só aceita janelas de até 1 ano; 366 dias cobre ano bissexto e `from`/`to` inclusivos.
const MAX_RANGE_SECS: i64 = 366 * 86400;

#[derive(Deserialize)]
pub struct RangeQuery {
    pub from: Option<String>,
    pub to: Option<String>,
}

/// Valida e normaliza o intervalo. Padrão: `default_days` até agora.
pub fn parse_range(q: &RangeQuery, default_days: i64) -> ApiResult<(String, String)> {
    let bad = |m: &str| ApiError::BadRequest(m.into());
    let to = match q.to.as_deref().filter(|v| !v.is_empty()) {
        Some(v) => parse_iso(v).ok_or_else(|| bad("to: use ISO 8601 (2026-11-08 ou 2026-11-08T12:00:00Z)"))?,
        None => now_secs(),
    };
    let from = match q.from.as_deref().filter(|v| !v.is_empty()) {
        Some(v) => parse_iso(v).ok_or_else(|| bad("from: use ISO 8601 (2026-11-08 ou 2026-11-08T12:00:00Z)"))?,
        None => to - default_days * 86400,
    };
    if from >= to {
        return Err(bad("from deve ser anterior a to"));
    }
    if to - from > MAX_RANGE_SECS {
        return Err(bad("intervalo máximo de 1 ano"));
    }
    Ok((fmt_secs(from), fmt_secs(to)))
}

pub async fn get(State(s): State<AppState>, u: AuthUser, Query(q): Query<RangeQuery>) -> ApiResult<Json<Value>> {
    let (from, to) = parse_range(&q, 365)?;
    let gh = s.github.clone();
    let cal = gh_call(&s, &u.id, |t| async move { gh.contributions(&t, &from, &to).await }).await?;
    with_mock(&s, cal)
}
