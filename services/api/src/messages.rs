use crate::{auth::AuthUser, error::{ApiError, ApiResult}, new_id, now_ms, servers::{channel_info, require_admin, require_member}, state::AppState};
use axum::{extract::{Path, Query, State}, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

const MAX_CONTENT: usize = 4000;

type MsgRow = (String, String, String, String, Option<String>, Option<String>, i64, Option<i64>, i64);

const SELECT_MSG: &str = "SELECT m.id, m.channel_id, m.author_id, u.username, u.avatar_url, m.reply_to, m.created_at, m.edited_at, m.deleted
    FROM messages m JOIN users u ON u.id = m.author_id";

async fn render(s: &AppState, rows: Vec<MsgRow>, contents: HashMap<String, String>) -> ApiResult<Vec<Value>> {
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let reacts: Vec<(String, i64)> =
            sqlx::query_as("SELECT emoji, COUNT(*) FROM message_reactions WHERE message_id = ? GROUP BY emoji ORDER BY MIN(rowid)")
                .bind(&r.0).fetch_all(&s.db).await?;
        let deleted = r.8 != 0;
        out.push(json!({
            "id": r.0, "channel_id": r.1,
            "author": {"id": r.2, "username": r.3, "avatar_url": r.4},
            "content": if deleted { String::new() } else { contents.get(&r.0).cloned().unwrap_or_default() },
            "reply_to": r.5, "created_at": r.6, "edited_at": r.7, "deleted": deleted,
            "reactions": reacts.into_iter().map(|(e, c)| json!({"emoji": e, "count": c})).collect::<Vec<_>>(),
        }));
    }
    Ok(out)
}

async fn fetch_one(s: &AppState, id: &str) -> ApiResult<Value> {
    let row: MsgRow = sqlx::query_as(&format!("{SELECT_MSG} WHERE m.id = ?")).bind(id).fetch_optional(&s.db).await?.ok_or(ApiError::NotFound)?;
    let (content,): (String,) = sqlx::query_as("SELECT content FROM messages WHERE id = ?").bind(id).fetch_one(&s.db).await?;
    let mut c = HashMap::new();
    c.insert(id.to_string(), content);
    Ok(render(s, vec![row], c).await?.remove(0))
}

#[derive(Deserialize)]
pub struct SendBody {
    content: String,
    reply_to: Option<String>,
    client_nonce: Option<String>,
}

pub async fn send(State(s): State<AppState>, u: AuthUser, Path(cid): Path<String>, Json(b): Json<SendBody>) -> ApiResult<Json<Value>> {
    let (sid, kind, _) = channel_info(&s, &cid).await?;
    require_member(&s, &sid, &u.id).await?;
    if kind != "text" {
        return Err(ApiError::BadRequest("canal de voz não recebe mensagens".into()));
    }
    let content = b.content.trim_end().to_string();
    if content.trim().is_empty() || content.chars().count() > MAX_CONTENT {
        return Err(ApiError::BadRequest(format!("mensagem: de 1 a {MAX_CONTENT} caracteres")));
    }
    // Reenvio com o mesmo nonce devolve a mensagem já salva (idempotência).
    if let Some(n) = &b.client_nonce {
        let ex: Option<(String,)> = sqlx::query_as("SELECT id FROM messages WHERE author_id = ? AND client_nonce = ?")
            .bind(&u.id).bind(n).fetch_optional(&s.db).await?;
        if let Some((id,)) = ex {
            return Ok(Json(fetch_one(&s, &id).await?));
        }
    }
    if let Some(r) = &b.reply_to {
        let ok: Option<(String,)> = sqlx::query_as("SELECT id FROM messages WHERE id = ? AND channel_id = ?")
            .bind(r).bind(&cid).fetch_optional(&s.db).await?;
        if ok.is_none() {
            return Err(ApiError::BadRequest("resposta a mensagem inexistente neste canal".into()));
        }
    }
    let id = new_id();
    sqlx::query("INSERT INTO messages (id, channel_id, author_id, content, reply_to, client_nonce, created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(&id).bind(&cid).bind(&u.id).bind(&content).bind(&b.reply_to).bind(&b.client_nonce).bind(now_ms())
        .execute(&s.db).await?;
    let msg = fetch_one(&s, &id).await?;
    s.hub.publish_channel(&sid, &cid, json!({"type": "message.created", "message": msg}));
    Ok(Json(msg))
}

#[derive(Deserialize)]
pub struct ListQuery {
    before: Option<String>,
    limit: Option<i64>,
}

/// Paginação por cursor: `before` é o id da mensagem mais antiga já carregada.
pub async fn list(State(s): State<AppState>, u: AuthUser, Path(cid): Path<String>, Query(q): Query<ListQuery>) -> ApiResult<Json<Value>> {
    let (sid, _, _) = channel_info(&s, &cid).await?;
    require_member(&s, &sid, &u.id).await?;
    let limit = q.limit.unwrap_or(50).clamp(1, 100);
    let (bt, bid): (i64, String) = match &q.before {
        Some(id) => sqlx::query_as("SELECT created_at, id FROM messages WHERE id = ? AND channel_id = ?")
            .bind(id).bind(&cid).fetch_optional(&s.db).await?.ok_or_else(|| ApiError::BadRequest("cursor inválido".into()))?,
        None => (i64::MAX, "\u{10FFFF}".to_string()),
    };
    let rows: Vec<MsgRow> = sqlx::query_as(&format!(
        "{SELECT_MSG} WHERE m.channel_id = ? AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))
         ORDER BY m.created_at DESC, m.id DESC LIMIT ?"
    )).bind(&cid).bind(bt).bind(bt).bind(&bid).bind(limit + 1).fetch_all(&s.db).await?;
    let has_more = rows.len() as i64 > limit;
    let rows: Vec<MsgRow> = rows.into_iter().take(limit as usize).collect();
    let mut contents = HashMap::new();
    for r in &rows {
        let (c,): (String,) = sqlx::query_as("SELECT content FROM messages WHERE id = ?").bind(&r.0).fetch_one(&s.db).await?;
        contents.insert(r.0.clone(), c);
    }
    let next = if has_more { rows.last().map(|r| r.0.clone()) } else { None };
    let msgs = render(&s, rows, contents).await?;
    Ok(Json(json!({"messages": msgs, "next_cursor": next})))
}

#[derive(Deserialize)]
pub struct EditBody {
    content: String,
}

async fn message_ctx(s: &AppState, id: &str) -> ApiResult<(String, String, String, bool)> {
    // (channel_id, server_id, author_id, deleted)
    sqlx::query_as::<_, (String, String, String, i64)>(
        "SELECT m.channel_id, c.server_id, m.author_id, m.deleted FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?",
    ).bind(id).fetch_optional(&s.db).await?.map(|r| (r.0, r.1, r.2, r.3 != 0)).ok_or(ApiError::NotFound)
}

pub async fn edit(State(s): State<AppState>, u: AuthUser, Path(id): Path<String>, Json(b): Json<EditBody>) -> ApiResult<Json<Value>> {
    let (cid, sid, author, deleted) = message_ctx(&s, &id).await?;
    require_member(&s, &sid, &u.id).await?;
    if author != u.id || deleted {
        return Err(ApiError::Forbidden);
    }
    let content = b.content.trim_end().to_string();
    if content.trim().is_empty() || content.chars().count() > MAX_CONTENT {
        return Err(ApiError::BadRequest(format!("mensagem: de 1 a {MAX_CONTENT} caracteres")));
    }
    sqlx::query("UPDATE messages SET content = ?, edited_at = ? WHERE id = ?").bind(&content).bind(now_ms()).bind(&id).execute(&s.db).await?;
    let msg = fetch_one(&s, &id).await?;
    s.hub.publish_channel(&sid, &cid, json!({"type": "message.updated", "message": msg}));
    Ok(Json(msg))
}

pub async fn remove(State(s): State<AppState>, u: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let (cid, sid, author, _) = message_ctx(&s, &id).await?;
    if author != u.id {
        require_admin(&s, &sid, &u.id).await?;
    } else {
        require_member(&s, &sid, &u.id).await?;
    }
    sqlx::query("UPDATE messages SET deleted = 1, content = '' WHERE id = ?").bind(&id).execute(&s.db).await?;
    s.hub.publish_channel(&sid, &cid, json!({"type": "message.deleted", "message_id": id, "channel_id": cid}));
    Ok(Json(json!({"ok": true})))
}

pub async fn react(State(s): State<AppState>, u: AuthUser, Path((id, emoji)): Path<(String, String)>) -> ApiResult<Json<Value>> {
    reaction(s, u, id, emoji, true).await
}

pub async fn unreact(State(s): State<AppState>, u: AuthUser, Path((id, emoji)): Path<(String, String)>) -> ApiResult<Json<Value>> {
    reaction(s, u, id, emoji, false).await
}

async fn reaction(s: AppState, u: AuthUser, id: String, emoji: String, add: bool) -> ApiResult<Json<Value>> {
    let (cid, sid, _, deleted) = message_ctx(&s, &id).await?;
    require_member(&s, &sid, &u.id).await?;
    if deleted || emoji.is_empty() || emoji.chars().count() > 16 {
        return Err(ApiError::BadRequest("emoji inválido".into()));
    }
    if add {
        sqlx::query("INSERT OR IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?,?,?)")
    } else {
        sqlx::query("DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
    }
    .bind(&id).bind(&u.id).bind(&emoji).execute(&s.db).await?;
    let ev = if add { "message.reaction_added" } else { "message.reaction_removed" };
    s.hub.publish_channel(&sid, &cid, json!({"type": ev, "message_id": id, "channel_id": cid, "user_id": u.id, "emoji": emoji}));
    Ok(Json(json!({"ok": true})))
}
