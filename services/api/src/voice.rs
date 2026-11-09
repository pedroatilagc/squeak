use crate::{auth::AuthUser, error::{ApiError, ApiResult}, servers::{channel_info, require_member}, state::AppState};
use axum::{extract::{Path, State}, Json};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Serialize)]
struct VideoGrant {
    room: String,
    #[serde(rename = "roomJoin")]
    room_join: bool,
    #[serde(rename = "canPublish")]
    can_publish: bool,
    #[serde(rename = "canSubscribe")]
    can_subscribe: bool,
    #[serde(rename = "canPublishData")]
    can_publish_data: bool,
    /// Quando presente, restringe o que a conexão pode publicar.
    #[serde(rename = "canPublishSources", skip_serializing_if = "Option::is_none")]
    can_publish_sources: Option<Vec<&'static str>>,
}

#[derive(Serialize)]
struct Claims {
    iss: String,
    sub: String,
    name: String,
    nbf: i64,
    exp: i64,
    video: VideoGrant,
}

pub fn room_name(channel_id: &str) -> String {
    format!("squak-{channel_id}")
}

/// Identity da conexão que publica a tela (o app nativo entra na sala como segundo participante).
pub fn share_identity(user_id: &str) -> String {
    format!("{user_id}-share")
}

async fn issue(s: &AppState, user_id: &str, cid: &str, share: bool) -> ApiResult<Json<Value>> {
    let (sid, kind, _) = channel_info(s, cid).await?;
    require_member(s, &sid, user_id).await?;
    if kind != "voice" {
        return Err(ApiError::BadRequest("não é um canal de voz".into()));
    }
    if share && !s.hub.voice_members(cid).iter().any(|u| u == user_id) {
        return Err(ApiError::Forbidden); // só quem já está na sala pode transmitir a tela
    }
    if s.cfg.livekit_key.is_empty() || s.cfg.livekit_secret.is_empty() {
        return Err(ApiError::Internal("LiveKit não configurado".into()));
    }
    let (username,): (String,) = sqlx::query_as("SELECT username FROM users WHERE id = ?").bind(user_id).fetch_one(&s.db).await?;
    let now = crate::now_ms() / 1000;
    let claims = Claims {
        iss: s.cfg.livekit_key.clone(),
        sub: if share { share_identity(user_id) } else { user_id.to_string() },
        name: username,
        nbf: now - 5,
        exp: now + 600,
        video: VideoGrant {
            room: room_name(cid),
            room_join: true,
            can_publish: true,
            can_subscribe: !share,
            can_publish_data: !share,
            can_publish_sources: share.then(|| vec!["screen_share", "screen_share_audio"]),
        },
    };
    let jwt = encode(&Header::default(), &claims, &EncodingKey::from_secret(s.cfg.livekit_secret.as_bytes()))
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(json!({"url": s.cfg.livekit_url, "room": room_name(cid), "token": jwt})))
}

/// Token de 10 minutos para a sala do canal de voz, só para membros do servidor.
pub async fn token(State(s): State<AppState>, u: AuthUser, Path(cid): Path<String>) -> ApiResult<Json<Value>> {
    issue(&s, &u.id, &cid, false).await
}

/// Token da conexão de tela: só publica `screen_share` e `screen_share_audio`, não assiste nem envia dados.
pub async fn share_token(State(s): State<AppState>, u: AuthUser, Path(cid): Path<String>) -> ApiResult<Json<Value>> {
    issue(&s, &u.id, &cid, true).await
}
