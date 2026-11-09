use crate::{error::{ApiError, ApiResult}, new_id, now_ms, state::AppState};
use argon2::{password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString}, Argon2};
use axum::{extract::{FromRequestParts, State}, http::{header, request::Parts}, Json};
use rand::{rngs::OsRng, RngCore};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const SESSION_TTL_MS: i64 = 30 * 24 * 3600 * 1000;
const MAX_FAILS: u32 = 5;
const FAIL_WINDOW_MS: i64 = 15 * 60 * 1000;

pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

pub struct AuthUser {
    pub id: String,
}

/// Resolve um token bruto para o id do usuário (sessão válida e não expirada).
pub async fn user_from_token(state: &AppState, token: &str) -> ApiResult<String> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
            .bind(hash_token(token))
            .bind(now_ms())
            .fetch_optional(&state.db)
            .await?;
    row.map(|r| r.0).ok_or(ApiError::Unauthorized)
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let token = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(ApiError::Unauthorized)?;
        Ok(AuthUser { id: user_from_token(state, token).await? })
    }
}

#[derive(Deserialize)]
pub struct Credentials {
    username: String,
    password: String,
}

fn valid_username(u: &str) -> bool {
    (3..=32).contains(&u.chars().count()) && u.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '.' || c == '-')
}

async fn new_session(state: &AppState, user_id: &str) -> ApiResult<String> {
    let mut raw = [0u8; 32];
    OsRng.fill_bytes(&mut raw);
    let token = hex::encode(raw);
    sqlx::query("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)")
        .bind(hash_token(&token))
        .bind(user_id)
        .bind(now_ms())
        .bind(now_ms() + SESSION_TTL_MS)
        .execute(&state.db)
        .await?;
    Ok(token)
}

pub async fn register(State(s): State<AppState>, Json(c): Json<Credentials>) -> ApiResult<Json<Value>> {
    let username = c.username.trim().to_string();
    if !valid_username(&username) {
        return Err(ApiError::BadRequest("usuário: 3 a 32 caracteres (letras, números, _ . -)".into()));
    }
    if c.password.chars().count() < 8 || c.password.len() > 128 {
        return Err(ApiError::BadRequest("senha: de 8 a 128 caracteres".into()));
    }
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default() // Argon2id
        .hash_password(c.password.as_bytes(), &salt)
        .map_err(|e| ApiError::Internal(e.to_string()))?
        .to_string();
    let id = new_id();
    let res = sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)")
        .bind(&id)
        .bind(&username)
        .bind(&hash)
        .bind(now_ms())
        .execute(&s.db)
        .await;
    match res {
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => {
            return Err(ApiError::Conflict("nome de usuário já existe".into()))
        }
        other => {
            other?;
        }
    }
    let token = new_session(&s, &id).await?;
    Ok(Json(json!({ "token": token, "user": { "id": id, "username": username } })))
}

pub async fn login(State(s): State<AppState>, Json(c): Json<Credentials>) -> ApiResult<Json<Value>> {
    let key = c.username.trim().to_lowercase();
    {
        let map = s.login_attempts.lock().unwrap();
        if let Some((n, start)) = map.get(&key) {
            if *n >= MAX_FAILS && now_ms() - start < FAIL_WINDOW_MS {
                return Err(ApiError::TooManyRequests);
            }
        }
    }
    let row: Option<(String, String, String)> =
        sqlx::query_as("SELECT id, username, password_hash FROM users WHERE username = ?")
            .bind(c.username.trim())
            .fetch_optional(&s.db)
            .await?;
    let ok = match &row {
        Some((_, _, hash)) => PasswordHash::new(hash)
            .map(|h| Argon2::default().verify_password(c.password.as_bytes(), &h).is_ok())
            .unwrap_or(false),
        None => false,
    };
    if !ok {
        let mut map = s.login_attempts.lock().unwrap();
        let e = map.entry(key).or_insert((0, now_ms()));
        if now_ms() - e.1 >= FAIL_WINDOW_MS {
            *e = (0, now_ms());
        }
        e.0 += 1;
        return Err(ApiError::Unauthorized);
    }
    s.login_attempts.lock().unwrap().remove(&key);
    let (id, username, _) = row.unwrap();
    let token = new_session(&s, &id).await?;
    Ok(Json(json!({ "token": token, "user": { "id": id, "username": username } })))
}

pub async fn logout(State(s): State<AppState>, parts: axum::http::HeaderMap) -> ApiResult<Json<Value>> {
    let token = parts
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(ApiError::Unauthorized)?;
    sqlx::query("DELETE FROM sessions WHERE token_hash = ?").bind(hash_token(token)).execute(&s.db).await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn me(State(s): State<AppState>, u: AuthUser) -> ApiResult<Json<Value>> {
    let r: (String, String, Option<String>, String) =
        sqlx::query_as("SELECT id, username, avatar_url, status_text FROM users WHERE id = ?")
            .bind(&u.id)
            .fetch_one(&s.db)
            .await?;
    Ok(Json(json!({ "id": r.0, "username": r.1, "avatar_url": r.2, "status_text": r.3 })))
}

#[derive(Deserialize)]
pub struct ProfilePatch {
    avatar_url: Option<String>,
    status_text: Option<String>,
}

pub async fn update_me(State(s): State<AppState>, u: AuthUser, Json(p): Json<ProfilePatch>) -> ApiResult<Json<Value>> {
    if let Some(t) = &p.status_text {
        if t.chars().count() > 128 {
            return Err(ApiError::BadRequest("status: no máximo 128 caracteres".into()));
        }
        sqlx::query("UPDATE users SET status_text = ? WHERE id = ?").bind(t).bind(&u.id).execute(&s.db).await?;
    }
    if let Some(a) = &p.avatar_url {
        if !(a.is_empty() || a.starts_with("https://")) || a.len() > 512 {
            return Err(ApiError::BadRequest("avatar: use uma URL https".into()));
        }
        sqlx::query("UPDATE users SET avatar_url = ? WHERE id = ?")
            .bind(if a.is_empty() { None } else { Some(a) })
            .bind(&u.id)
            .execute(&s.db)
            .await?;
    }
    me(State(s), u).await
}
