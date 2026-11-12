use crate::{auth::AuthUser, error::{ApiError, ApiResult}, new_id, now_ms, state::AppState};
use axum::{extract::{Path, State}, Json};
use rand::{distributions::Alphanumeric, Rng};
use serde::Deserialize;
use serde_json::{json, Value};

/// Papel do usuário no servidor, ou `None` se não for membro.
pub async fn role_of(s: &AppState, server_id: &str, user_id: &str) -> ApiResult<Option<String>> {
    let r: Option<(String,)> = sqlx::query_as("SELECT role FROM server_members WHERE server_id = ? AND user_id = ?")
        .bind(server_id)
        .bind(user_id)
        .fetch_optional(&s.db)
        .await?;
    Ok(r.map(|r| r.0))
}

/// Falha com NotFound (não vaza a existência do servidor) quando o usuário não é membro.
pub async fn require_member(s: &AppState, server_id: &str, user_id: &str) -> ApiResult<String> {
    role_of(s, server_id, user_id).await?.ok_or(ApiError::NotFound)
}

pub async fn require_admin(s: &AppState, server_id: &str, user_id: &str) -> ApiResult<String> {
    let role = require_member(s, server_id, user_id).await?;
    if role == "owner" || role == "admin" { Ok(role) } else { Err(ApiError::Forbidden) }
}

/// (server_id, kind, name) do canal.
pub async fn channel_info(s: &AppState, channel_id: &str) -> ApiResult<(String, String, String)> {
    sqlx::query_as("SELECT server_id, kind, name FROM channels WHERE id = ?")
        .bind(channel_id)
        .fetch_optional(&s.db)
        .await?
        .ok_or(ApiError::NotFound)
}

fn clean_name(n: &str, what: &str) -> ApiResult<String> {
    let n = n.trim();
    if n.is_empty() || n.chars().count() > 64 {
        return Err(ApiError::BadRequest(format!("{what}: de 1 a 64 caracteres")));
    }
    Ok(n.to_string())
}

#[derive(Deserialize)]
pub struct NameBody {
    name: String,
}

pub async fn list(State(s): State<AppState>, u: AuthUser) -> ApiResult<Json<Value>> {
    let rows: Vec<(String, String, Option<String>, String, String)> = sqlx::query_as(
        "SELECT s.id, s.name, s.icon_url, s.owner_id, m.role FROM servers s
         JOIN server_members m ON m.server_id = s.id WHERE m.user_id = ? ORDER BY m.joined_at",
    )
    .bind(&u.id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(json!(rows.into_iter().map(|r| json!({"id": r.0, "name": r.1, "icon_url": r.2, "owner_id": r.3, "role": r.4})).collect::<Vec<_>>())))
}

pub async fn create(State(s): State<AppState>, u: AuthUser, Json(b): Json<NameBody>) -> ApiResult<Json<Value>> {
    let name = clean_name(&b.name, "nome do servidor")?;
    let id = new_id();
    let now = now_ms();
    let mut tx = s.db.begin().await?;
    sqlx::query("INSERT INTO servers (id, name, owner_id, created_at) VALUES (?,?,?,?)")
        .bind(&id).bind(&name).bind(&u.id).bind(now).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?,?,'owner',?)")
        .bind(&id).bind(&u.id).bind(now).execute(&mut *tx).await?;
    // Estrutura inicial: uma categoria de texto e uma de voz, com um canal cada.
    for (cat, ch, kind, pos) in [("Canais de texto", "geral", "text", 0), ("Canais de voz", "Sala 1", "voice", 1)] {
        let cid = new_id();
        sqlx::query("INSERT INTO categories (id, server_id, name, position) VALUES (?,?,?,?)")
            .bind(&cid).bind(&id).bind(cat).bind(pos).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO channels (id, server_id, category_id, name, kind, position, created_at) VALUES (?,?,?,?,?,0,?)")
            .bind(new_id()).bind(&id).bind(&cid).bind(ch).bind(kind).bind(now).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(Json(json!({ "id": id, "name": name, "owner_id": u.id, "role": "owner" })))
}

pub async fn detail(State(s): State<AppState>, u: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let role = require_member(&s, &id, &u.id).await?;
    let (name, owner): (String, String) = sqlx::query_as("SELECT name, owner_id FROM servers WHERE id = ?")
        .bind(&id).fetch_one(&s.db).await?;
    let cats: Vec<(String, String, i64)> =
        sqlx::query_as("SELECT id, name, position FROM categories WHERE server_id = ? ORDER BY position, name")
            .bind(&id).fetch_all(&s.db).await?;
    let chans: Vec<(String, Option<String>, String, String, i64)> = sqlx::query_as(
        "SELECT id, category_id, name, kind, position FROM channels WHERE server_id = ? ORDER BY position, name",
    ).bind(&id).fetch_all(&s.db).await?;
    let members: Vec<(String, String, Option<String>, String, String)> = sqlx::query_as(
        "SELECT u.id, u.username, u.avatar_url, u.status_text, m.role FROM server_members m
         JOIN users u ON u.id = m.user_id WHERE m.server_id = ? ORDER BY u.username",
    ).bind(&id).fetch_all(&s.db).await?;
    let voice: serde_json::Map<String, Value> = chans
        .iter()
        .filter(|c| c.3 == "voice")
        .map(|c| (c.0.clone(), json!(s.hub.voice_members(&c.0))))
        .collect();
    let online: Vec<&str> = members.iter().filter(|m| s.hub.is_online(&m.0)).map(|m| m.0.as_str()).collect();
    Ok(Json(json!({
        "voice": voice, "online": online,
        "id": id, "name": name, "owner_id": owner, "my_role": role,
        "categories": cats.into_iter().map(|c| json!({"id": c.0, "name": c.1, "position": c.2})).collect::<Vec<_>>(),
        "channels": chans.into_iter().map(|c| json!({"id": c.0, "category_id": c.1, "name": c.2, "kind": c.3, "position": c.4})).collect::<Vec<_>>(),
        "members": members.into_iter().map(|m| json!({"id": m.0, "username": m.1, "avatar_url": m.2, "status_text": m.3, "role": m.4})).collect::<Vec<_>>(),
    })))
}

pub async fn remove(State(s): State<AppState>, u: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let role = require_member(&s, &id, &u.id).await?;
    if role != "owner" {
        return Err(ApiError::Forbidden);
    }
    sqlx::query("DELETE FROM servers WHERE id = ?").bind(&id).execute(&s.db).await?;
    s.hub.publish(&id, json!({"type": "server.deleted", "server_id": id}));
    Ok(Json(json!({"ok": true})))
}

pub async fn leave(State(s): State<AppState>, u: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let role = require_member(&s, &id, &u.id).await?;
    if role == "owner" {
        return Err(ApiError::BadRequest("o dono não pode sair; exclua o servidor ou transfira a propriedade".into()));
    }
    sqlx::query("DELETE FROM server_members WHERE server_id = ? AND user_id = ?").bind(&id).bind(&u.id).execute(&s.db).await?;
    s.hub.publish(&id, json!({"type": "member.left", "server_id": id, "user_id": u.id}));
    Ok(Json(json!({"ok": true})))
}

pub async fn create_invite(State(s): State<AppState>, u: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    require_member(&s, &id, &u.id).await?;
    let code: String = rand::thread_rng().sample_iter(&Alphanumeric).take(10).map(char::from).collect();
    sqlx::query("INSERT INTO invitations (code, server_id, created_by, created_at, expires_at) VALUES (?,?,?,?,?)")
        .bind(&code).bind(&id).bind(&u.id).bind(now_ms()).bind(now_ms() + 7 * 24 * 3600 * 1000)
        .execute(&s.db).await?;
    Ok(Json(json!({"code": code})))
}

pub async fn revoke_invite(State(s): State<AppState>, u: AuthUser, Path((id, code)): Path<(String, String)>) -> ApiResult<Json<Value>> {
    require_admin(&s, &id, &u.id).await?;
    sqlx::query("UPDATE invitations SET revoked = 1 WHERE code = ? AND server_id = ?").bind(&code).bind(&id).execute(&s.db).await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn join(State(s): State<AppState>, u: AuthUser, Path(code): Path<String>) -> ApiResult<Json<Value>> {
    let inv: Option<(String,)> = sqlx::query_as(
        "SELECT server_id FROM invitations WHERE code = ? AND revoked = 0 AND (expires_at IS NULL OR expires_at > ?)",
    ).bind(&code).bind(now_ms()).fetch_optional(&s.db).await?;
    let (server_id,) = inv.ok_or(ApiError::NotFound)?;
    sqlx::query("INSERT OR IGNORE INTO server_members (server_id, user_id, role, joined_at) VALUES (?,?,'member',?)")
        .bind(&server_id).bind(&u.id).bind(now_ms()).execute(&s.db).await?;
    s.hub.publish(&server_id, json!({"type": "member.joined", "server_id": server_id, "user_id": u.id}));
    Ok(Json(json!({"server_id": server_id})))
}

pub async fn create_category(State(s): State<AppState>, u: AuthUser, Path(id): Path<String>, Json(b): Json<NameBody>) -> ApiResult<Json<Value>> {
    require_admin(&s, &id, &u.id).await?;
    let name = clean_name(&b.name, "categoria")?;
    let cid = new_id();
    sqlx::query("INSERT INTO categories (id, server_id, name, position) VALUES (?,?,?, (SELECT COALESCE(MAX(position)+1,0) FROM categories WHERE server_id = ?))")
        .bind(&cid).bind(&id).bind(&name).bind(&id).execute(&s.db).await?;
    s.hub.publish(&id, json!({"type": "channel.changed", "server_id": id}));
    Ok(Json(json!({"id": cid, "name": name})))
}

#[derive(Deserialize)]
pub struct NewChannel {
    name: String,
    kind: String,
    category_id: Option<String>,
}

pub async fn create_channel(State(s): State<AppState>, u: AuthUser, Path(id): Path<String>, Json(b): Json<NewChannel>) -> ApiResult<Json<Value>> {
    require_admin(&s, &id, &u.id).await?;
    if b.kind != "text" && b.kind != "voice" {
        return Err(ApiError::BadRequest("tipo deve ser text ou voice".into()));
    }
    let name = clean_name(&b.name, "canal")?;
    if let Some(cat) = &b.category_id {
        // A categoria precisa pertencer ao mesmo servidor (evita referência cruzada entre servidores).
        let ok: Option<(String,)> = sqlx::query_as("SELECT id FROM categories WHERE id = ? AND server_id = ?")
            .bind(cat).bind(&id).fetch_optional(&s.db).await?;
        if ok.is_none() {
            return Err(ApiError::BadRequest("categoria inválida".into()));
        }
    }
    let cid = new_id();
    sqlx::query("INSERT INTO channels (id, server_id, category_id, name, kind, position, created_at)
                 VALUES (?,?,?,?,?, (SELECT COALESCE(MAX(position)+1,0) FROM channels WHERE server_id = ?), ?)")
        .bind(&cid).bind(&id).bind(&b.category_id).bind(&name).bind(&b.kind).bind(&id).bind(now_ms())
        .execute(&s.db).await?;
    s.hub.publish(&id, json!({"type": "channel.changed", "server_id": id}));
    Ok(Json(json!({"id": cid, "name": name, "kind": b.kind})))
}

pub async fn rename_channel(State(s): State<AppState>, u: AuthUser, Path(cid): Path<String>, Json(b): Json<NameBody>) -> ApiResult<Json<Value>> {
    let (sid, _, _) = channel_info(&s, &cid).await?;
    require_admin(&s, &sid, &u.id).await?;
    let name = clean_name(&b.name, "canal")?;
    sqlx::query("UPDATE channels SET name = ? WHERE id = ?").bind(&name).bind(&cid).execute(&s.db).await?;
    s.hub.publish(&sid, json!({"type": "channel.changed", "server_id": sid}));
    Ok(Json(json!({"ok": true})))
}

pub async fn delete_channel(State(s): State<AppState>, u: AuthUser, Path(cid): Path<String>) -> ApiResult<Json<Value>> {
    let (sid, _, _) = channel_info(&s, &cid).await?;
    require_admin(&s, &sid, &u.id).await?;
    sqlx::query("DELETE FROM channels WHERE id = ?").bind(&cid).execute(&s.db).await?;
    s.hub.publish(&sid, json!({"type": "channel.changed", "server_id": sid}));
    Ok(Json(json!({"ok": true})))
}

#[derive(Deserialize)]
pub struct RoleBody {
    role: String,
}

pub async fn set_role(State(s): State<AppState>, u: AuthUser, Path((id, target)): Path<(String, String)>, Json(b): Json<RoleBody>) -> ApiResult<Json<Value>> {
    if require_member(&s, &id, &u.id).await? != "owner" {
        return Err(ApiError::Forbidden);
    }
    if b.role != "admin" && b.role != "member" {
        return Err(ApiError::BadRequest("papel deve ser admin ou member".into()));
    }
    if target == u.id {
        return Err(ApiError::BadRequest("o dono não pode alterar o próprio papel".into()));
    }
    let n = sqlx::query("UPDATE server_members SET role = ? WHERE server_id = ? AND user_id = ?")
        .bind(&b.role).bind(&id).bind(&target).execute(&s.db).await?.rows_affected();
    if n == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(json!({"ok": true})))
}

pub async fn kick(State(s): State<AppState>, u: AuthUser, Path((id, target)): Path<(String, String)>) -> ApiResult<Json<Value>> {
    let my = require_admin(&s, &id, &u.id).await?;
    let their = role_of(&s, &id, &target).await?.ok_or(ApiError::NotFound)?;
    // Admin só expulsa membros comuns; só o dono expulsa admins; ninguém expulsa o dono.
    let allowed = their == "member" || (my == "owner" && their == "admin");
    if !allowed {
        return Err(ApiError::Forbidden);
    }
    sqlx::query("DELETE FROM server_members WHERE server_id = ? AND user_id = ?").bind(&id).bind(&target).execute(&s.db).await?;
    s.hub.publish(&id, json!({"type": "member.left", "server_id": id, "user_id": target}));
    Ok(Json(json!({"ok": true})))
}
