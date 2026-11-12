//! GET /github/profile
use super::{authentication::gh_call, with_mock};
use crate::{auth::AuthUser, error::ApiResult, state::AppState};
use axum::{extract::State, Json};
use serde_json::Value;

pub async fn get(State(s): State<AppState>, u: AuthUser) -> ApiResult<Json<Value>> {
    let gh = s.github.clone();
    let profile = gh_call(&s, &u.id, |t| async move { gh.profile(&t).await }).await?;
    with_mock(&s, profile)
}
