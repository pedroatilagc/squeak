//! SQL da integração GitHub. Nada de regra de negócio aqui.
use crate::{error::ApiResult, new_id, now_ms};
use sqlx::{Sqlite, SqlitePool, Transaction};

// ---------- contas e fluxos de dispositivo ----------

#[derive(sqlx::FromRow, Clone)]
pub struct AccountRow {
    pub user_id: String,
    pub github_id: i64,
    pub login: String,
    pub avatar_url: Option<String>,
    pub access_token_enc: String,
    pub refresh_token_enc: Option<String>,
    pub access_expires_at: Option<i64>,
    pub refresh_expires_at: Option<i64>,
    pub status: String,
}

pub async fn get_account(db: &SqlitePool, user_id: &str) -> ApiResult<Option<AccountRow>> {
    Ok(sqlx::query_as(
        "SELECT user_id, github_id, login, avatar_url, access_token_enc, refresh_token_enc,
                access_expires_at, refresh_expires_at, status
         FROM github_accounts WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?)
}

pub async fn upsert_account(db: &SqlitePool, a: &AccountRow) -> ApiResult<()> {
    sqlx::query(
        "INSERT INTO github_accounts (user_id, github_id, login, avatar_url, access_token_enc, refresh_token_enc,
                access_expires_at, refresh_expires_at, connected_at, status)
         VALUES (?,?,?,?,?,?,?,?,?,'connected')
         ON CONFLICT(user_id) DO UPDATE SET github_id = excluded.github_id, login = excluded.login,
                avatar_url = excluded.avatar_url, access_token_enc = excluded.access_token_enc,
                refresh_token_enc = excluded.refresh_token_enc, access_expires_at = excluded.access_expires_at,
                refresh_expires_at = excluded.refresh_expires_at, connected_at = excluded.connected_at,
                status = 'connected'",
    )
    .bind(&a.user_id)
    .bind(a.github_id)
    .bind(&a.login)
    .bind(&a.avatar_url)
    .bind(&a.access_token_enc)
    .bind(&a.refresh_token_enc)
    .bind(a.access_expires_at)
    .bind(a.refresh_expires_at)
    .bind(now_ms())
    .execute(db)
    .await?;
    Ok(())
}

pub async fn update_tokens(
    db: &SqlitePool,
    user_id: &str,
    access_enc: &str,
    refresh_enc: Option<&str>,
    access_exp: Option<i64>,
    refresh_exp: Option<i64>,
) -> ApiResult<()> {
    sqlx::query(
        "UPDATE github_accounts SET access_token_enc = ?, refresh_token_enc = ?, access_expires_at = ?,
                refresh_expires_at = ?, status = 'connected' WHERE user_id = ?",
    )
    .bind(access_enc)
    .bind(refresh_enc)
    .bind(access_exp)
    .bind(refresh_exp)
    .bind(user_id)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn set_status(db: &SqlitePool, user_id: &str, status: &str) -> ApiResult<()> {
    sqlx::query("UPDATE github_accounts SET status = ? WHERE user_id = ?").bind(status).bind(user_id).execute(db).await?;
    Ok(())
}

pub async fn delete_account(db: &SqlitePool, user_id: &str) -> ApiResult<()> {
    sqlx::query("DELETE FROM github_accounts WHERE user_id = ?").bind(user_id).execute(db).await?;
    sqlx::query("DELETE FROM github_device_flows WHERE user_id = ?").bind(user_id).execute(db).await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
pub struct FlowRow {
    pub flow_id: String,
    pub device_code_enc: String,
    pub expires_at: i64,
    pub interval_s: i64,
}

/// Um fluxo ativo por usuário: o novo substitui os anteriores.
pub async fn insert_flow(
    db: &SqlitePool,
    user_id: &str,
    device_code_enc: &str,
    user_code: &str,
    expires_at: i64,
    interval_s: i64,
) -> ApiResult<String> {
    let id = new_id();
    sqlx::query("DELETE FROM github_device_flows WHERE user_id = ? OR expires_at < ?")
        .bind(user_id)
        .bind(now_ms())
        .execute(db)
        .await?;
    sqlx::query(
        "INSERT INTO github_device_flows (flow_id, user_id, device_code_enc, user_code, expires_at, interval_s, created_at)
         VALUES (?,?,?,?,?,?,?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(device_code_enc)
    .bind(user_code)
    .bind(expires_at)
    .bind(interval_s)
    .bind(now_ms())
    .execute(db)
    .await?;
    Ok(id)
}

pub async fn get_flow(db: &SqlitePool, flow_id: &str, user_id: &str) -> ApiResult<Option<FlowRow>> {
    Ok(sqlx::query_as(
        "SELECT flow_id, device_code_enc, expires_at, interval_s FROM github_device_flows WHERE flow_id = ? AND user_id = ?",
    )
    .bind(flow_id)
    .bind(user_id)
    .fetch_optional(db)
    .await?)
}

pub async fn set_flow_interval(db: &SqlitePool, flow_id: &str, interval_s: i64) -> ApiResult<()> {
    sqlx::query("UPDATE github_device_flows SET interval_s = ? WHERE flow_id = ?").bind(interval_s).bind(flow_id).execute(db).await?;
    Ok(())
}

pub async fn delete_flow(db: &SqlitePool, flow_id: &str) -> ApiResult<()> {
    sqlx::query("DELETE FROM github_device_flows WHERE flow_id = ?").bind(flow_id).execute(db).await?;
    Ok(())
}

// ---------- vínculos servidor <-> repositório ----------

#[derive(sqlx::FromRow)]
pub struct LinkRow {
    pub id: String,
    pub installation_id: i64,
    pub repo_id: i64,
    pub repo_full_name: String,
    pub activity_channel_id: Option<String>,
}

pub async fn list_links(db: &SqlitePool, server_id: &str) -> ApiResult<Vec<LinkRow>> {
    Ok(sqlx::query_as(
        "SELECT id, installation_id, repo_id, repo_full_name, activity_channel_id
         FROM server_github_repos WHERE server_id = ? ORDER BY repo_full_name COLLATE NOCASE",
    )
    .bind(server_id)
    .fetch_all(db)
    .await?)
}

/// Substitui, de forma atômica, os vínculos daquela instalação neste servidor.
pub async fn replace_links(
    db: &SqlitePool,
    server_id: &str,
    installation_id: i64,
    repos: &[(i64, String)],
    channel_id: Option<&str>,
    user_id: &str,
) -> ApiResult<()> {
    let mut tx = db.begin().await?;
    sqlx::query("DELETE FROM server_github_repos WHERE server_id = ? AND installation_id = ?")
        .bind(server_id)
        .bind(installation_id)
        .execute(&mut *tx)
        .await?;
    for (repo_id, full_name) in repos {
        sqlx::query(
            "INSERT INTO server_github_repos (id, server_id, installation_id, repo_id, repo_full_name, activity_channel_id, created_by, created_at)
             VALUES (?,?,?,?,?,?,?,?)
             ON CONFLICT(server_id, repo_id) DO UPDATE SET installation_id = excluded.installation_id,
                repo_full_name = excluded.repo_full_name, activity_channel_id = excluded.activity_channel_id",
        )
        .bind(new_id())
        .bind(server_id)
        .bind(installation_id)
        .bind(repo_id)
        .bind(full_name)
        .bind(channel_id)
        .bind(user_id)
        .bind(now_ms())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn delete_link(db: &SqlitePool, server_id: &str, link_id: &str) -> ApiResult<bool> {
    let r = sqlx::query("DELETE FROM server_github_repos WHERE id = ? AND server_id = ?")
        .bind(link_id)
        .bind(server_id)
        .execute(db)
        .await?;
    Ok(r.rows_affected() > 0)
}

pub async fn servers_linked_to_repo(db: &SqlitePool, repo_id: i64) -> ApiResult<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT DISTINCT server_id FROM server_github_repos WHERE repo_id = ?")
        .bind(repo_id)
        .fetch_all(db)
        .await?;
    Ok(rows.into_iter().map(|r| r.0).collect())
}

/// `(server_id, kind)` do canal, para validar `activity_channel_id`.
pub async fn channel_server_and_kind(db: &SqlitePool, channel_id: &str) -> ApiResult<Option<(String, String)>> {
    Ok(sqlx::query_as("SELECT server_id, kind FROM channels WHERE id = ?").bind(channel_id).fetch_optional(db).await?)
}

// ---------- gravação de webhooks (dentro de uma transação) ----------

/// `false` quando a entrega já tinha sido processada.
pub async fn insert_delivery(tx: &mut Transaction<'_, Sqlite>, delivery_id: &str) -> ApiResult<bool> {
    let r = sqlx::query("INSERT OR IGNORE INTO github_deliveries (delivery_id, received_at) VALUES (?,?)")
        .bind(delivery_id)
        .bind(now_ms())
        .execute(&mut **tx)
        .await?;
    Ok(r.rows_affected() > 0)
}

pub struct PrUpsert {
    pub repo_id: i64,
    pub number: i64,
    pub node_id: String,
    pub repo_full_name: String,
    pub title: String,
    pub url: String,
    pub author_login: String,
    pub author_avatar: Option<String>,
    pub head_ref: String,
    pub base_ref: String,
    pub head_sha: String,
    pub state: String,
    pub is_draft: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Entregas fora de ordem não regridem o card: só aplica se `updated_at` não for mais antigo.
pub async fn upsert_pr(tx: &mut Transaction<'_, Sqlite>, p: &PrUpsert) -> ApiResult<()> {
    sqlx::query(
        "INSERT INTO github_pull_requests (repo_id, number, node_id, repo_full_name, title, url, author_login, author_avatar,
                head_ref, base_ref, head_sha, state, is_draft, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(repo_id, number) DO UPDATE SET node_id = excluded.node_id, repo_full_name = excluded.repo_full_name,
                title = excluded.title, url = excluded.url, author_login = excluded.author_login,
                author_avatar = excluded.author_avatar, head_ref = excluded.head_ref, base_ref = excluded.base_ref,
                head_sha = excluded.head_sha, state = excluded.state, is_draft = excluded.is_draft,
                updated_at = excluded.updated_at
         WHERE excluded.updated_at >= github_pull_requests.updated_at",
    )
    .bind(p.repo_id)
    .bind(p.number)
    .bind(&p.node_id)
    .bind(&p.repo_full_name)
    .bind(&p.title)
    .bind(&p.url)
    .bind(&p.author_login)
    .bind(&p.author_avatar)
    .bind(&p.head_ref)
    .bind(&p.base_ref)
    .bind(&p.head_sha)
    .bind(&p.state)
    .bind(p.is_draft)
    .bind(&p.created_at)
    .bind(&p.updated_at)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub struct ReviewUpsert {
    pub repo_id: i64,
    pub number: i64,
    pub reviewer_login: String,
    pub reviewer_avatar: Option<String>,
    pub state: String,
    pub submitted_at: String,
}

/// Um comentário simples não apaga uma aprovação/pedido de mudança anterior (semântica do GitHub).
pub async fn upsert_review(tx: &mut Transaction<'_, Sqlite>, r: &ReviewUpsert) -> ApiResult<()> {
    sqlx::query(
        "INSERT INTO github_pr_reviews (repo_id, number, reviewer_login, reviewer_avatar, state, submitted_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(repo_id, number, reviewer_login) DO UPDATE SET
            state = CASE WHEN excluded.state = 'COMMENTED' AND github_pr_reviews.state IN ('APPROVED','CHANGES_REQUESTED')
                         THEN github_pr_reviews.state ELSE excluded.state END,
            reviewer_avatar = excluded.reviewer_avatar, submitted_at = excluded.submitted_at
         WHERE excluded.submitted_at >= github_pr_reviews.submitted_at",
    )
    .bind(r.repo_id)
    .bind(r.number)
    .bind(&r.reviewer_login)
    .bind(&r.reviewer_avatar)
    .bind(&r.state)
    .bind(&r.submitted_at)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub struct CheckUpsert {
    pub repo_id: i64,
    pub head_sha: String,
    pub source: String,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub updated_at: String,
}

pub async fn upsert_check(tx: &mut Transaction<'_, Sqlite>, c: &CheckUpsert) -> ApiResult<()> {
    sqlx::query(
        "INSERT INTO github_checks (repo_id, head_sha, source, name, status, conclusion, updated_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(repo_id, head_sha, source, name) DO UPDATE SET status = excluded.status,
                conclusion = excluded.conclusion, updated_at = excluded.updated_at
         WHERE excluded.updated_at >= github_checks.updated_at",
    )
    .bind(c.repo_id)
    .bind(&c.head_sha)
    .bind(&c.source)
    .bind(&c.name)
    .bind(&c.status)
    .bind(&c.conclusion)
    .bind(&c.updated_at)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub struct EventInsert {
    pub delivery_id: String,
    pub dedupe_key: String,
    pub repo_id: i64,
    pub repo_full_name: String,
    pub kind: String,
    pub action: Option<String>,
    pub actor_login: String,
    pub actor_avatar: Option<String>,
    pub title: String,
    pub url: Option<String>,
    pub detail_json: String,
    pub occurred_at: String,
}

/// Devolve o id do evento novo, ou `None` se `dedupe_key` (ou a entrega) já existia.
pub async fn insert_event(tx: &mut Transaction<'_, Sqlite>, e: &EventInsert) -> ApiResult<Option<String>> {
    let id = new_id();
    let r = sqlx::query(
        "INSERT OR IGNORE INTO github_events (id, delivery_id, dedupe_key, repo_id, repo_full_name, kind, action,
                actor_login, actor_avatar, title, url, payload_json, occurred_at, received_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(&id)
    .bind(&e.delivery_id)
    .bind(&e.dedupe_key)
    .bind(e.repo_id)
    .bind(&e.repo_full_name)
    .bind(&e.kind)
    .bind(&e.action)
    .bind(&e.actor_login)
    .bind(&e.actor_avatar)
    .bind(&e.title)
    .bind(&e.url)
    .bind(&e.detail_json)
    .bind(&e.occurred_at)
    .bind(now_ms())
    .execute(&mut **tx)
    .await?;
    Ok((r.rows_affected() > 0).then_some(id))
}

pub async fn pr_numbers_by_sha(db: &SqlitePool, repo_id: i64, sha: &str) -> ApiResult<Vec<i64>> {
    let rows: Vec<(i64,)> = sqlx::query_as("SELECT number FROM github_pull_requests WHERE repo_id = ? AND head_sha = ?")
        .bind(repo_id)
        .bind(sha)
        .fetch_all(db)
        .await?;
    Ok(rows.into_iter().map(|r| r.0).collect())
}

// ---------- leitura para cards de PR do servidor ----------

#[derive(sqlx::FromRow)]
pub struct PrRow {
    pub repo_id: i64,
    pub number: i64,
    pub node_id: String,
    pub repo_full_name: String,
    pub title: String,
    pub url: String,
    pub author_login: String,
    pub author_avatar: Option<String>,
    pub head_ref: String,
    pub base_ref: String,
    pub head_sha: String,
    pub state: String,
    pub is_draft: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn server_prs(db: &SqlitePool, server_id: &str) -> ApiResult<Vec<PrRow>> {
    Ok(sqlx::query_as(
        "SELECT repo_id, number, node_id, repo_full_name, title, url, author_login, author_avatar, head_ref, base_ref,
                head_sha, state, is_draft, created_at, updated_at
         FROM github_pull_requests
         WHERE repo_id IN (SELECT repo_id FROM server_github_repos WHERE server_id = ?)
         ORDER BY updated_at DESC, repo_id, number DESC LIMIT 500",
    )
    .bind(server_id)
    .fetch_all(db)
    .await?)
}

#[derive(sqlx::FromRow)]
pub struct ReviewRow {
    pub repo_id: i64,
    pub number: i64,
    pub reviewer_login: String,
    pub reviewer_avatar: Option<String>,
    pub state: String,
}

pub async fn server_reviews(db: &SqlitePool, server_id: &str) -> ApiResult<Vec<ReviewRow>> {
    Ok(sqlx::query_as(
        "SELECT repo_id, number, reviewer_login, reviewer_avatar, state FROM github_pr_reviews
         WHERE repo_id IN (SELECT repo_id FROM server_github_repos WHERE server_id = ?)
         ORDER BY submitted_at, reviewer_login",
    )
    .bind(server_id)
    .fetch_all(db)
    .await?)
}

#[derive(sqlx::FromRow)]
pub struct CheckRow {
    pub repo_id: i64,
    pub head_sha: String,
    pub source: String,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
}

pub async fn server_checks(db: &SqlitePool, server_id: &str) -> ApiResult<Vec<CheckRow>> {
    Ok(sqlx::query_as(
        "SELECT repo_id, head_sha, source, name, status, conclusion FROM github_checks
         WHERE repo_id IN (SELECT repo_id FROM server_github_repos WHERE server_id = ?)",
    )
    .bind(server_id)
    .fetch_all(db)
    .await?)
}

// ---------- feed de atividade do servidor ----------

#[derive(sqlx::FromRow)]
pub struct FeedRow {
    pub id: String,
    pub source: String,
    pub kind: String,
    pub action: Option<String>,
    pub actor_name: String,
    pub actor_avatar: Option<String>,
    pub actor_user_id: Option<String>,
    pub title: String,
    pub repo: Option<String>,
    pub url: Option<String>,
    pub occurred_at: String,
    pub detail_json: Option<String>,
}

#[derive(Default)]
pub struct FeedFilter {
    pub actor: Option<String>,
    pub repo: Option<String>,
    pub kind: Option<String>,
    /// (occurred_at, id) do último item da página anterior.
    pub before: Option<(String, String)>,
}

const SQUAK_TS: &str = "strftime('%Y-%m-%dT%H:%M:%SZ', {col} / 1000, 'unixepoch')";

/// Mistura eventos do GitHub (repos vinculados) e do Squak (entradas e canais), já ordenados e limitados.
/// A união é feita em SQL para que ordem e cursor tenham uma única definição: (occurred_at DESC, id DESC).
pub async fn feed(db: &SqlitePool, server_id: &str, f: &FeedFilter, limit: i64) -> ApiResult<Vec<FeedRow>> {
    let joined = SQUAK_TS.replace("{col}", "m.joined_at");
    let created = SQUAK_TS.replace("{col}", "c.created_at");
    let mut sql = format!(
        "SELECT * FROM (
           SELECT 'ev:' || e.id AS id, 'github' AS source, e.kind AS kind, e.action AS action,
                  e.actor_login AS actor_name, e.actor_avatar AS actor_avatar, NULL AS actor_user_id,
                  e.title AS title, e.repo_full_name AS repo, e.url AS url, e.occurred_at AS occurred_at,
                  e.payload_json AS detail_json
           FROM github_events e
           WHERE e.repo_id IN (SELECT repo_id FROM server_github_repos WHERE server_id = ?)
           UNION ALL
           SELECT 'ev:member_joined:' || m.user_id, 'concord', 'member_joined', NULL,
                  u.username, u.avatar_url, u.id, u.username || ' entrou no servidor', NULL, NULL, {joined}, NULL
           FROM server_members m JOIN users u ON u.id = m.user_id WHERE m.server_id = ?
           UNION ALL
           SELECT 'ev:channel_created:' || c.id, 'concord', 'channel_created', NULL,
                  'Squak', NULL, NULL, 'Canal ' || c.name || ' criado', NULL, NULL, {created}, NULL
           FROM channels c WHERE c.server_id = ?
         ) WHERE 1 = 1"
    );
    let mut binds: Vec<String> = vec![server_id.into(), server_id.into(), server_id.into()];
    if let Some(a) = &f.actor {
        sql.push_str(" AND actor_name = ? COLLATE NOCASE");
        binds.push(a.clone());
    }
    if let Some(r) = &f.repo {
        sql.push_str(" AND repo = ? COLLATE NOCASE");
        binds.push(r.clone());
    }
    if let Some(k) = &f.kind {
        sql.push_str(" AND kind = ?");
        binds.push(k.clone());
    }
    if let Some((at, id)) = &f.before {
        sql.push_str(" AND (occurred_at < ? OR (occurred_at = ? AND id < ?))");
        binds.extend([at.clone(), at.clone(), id.clone()]);
    }
    sql.push_str(" ORDER BY occurred_at DESC, id DESC LIMIT ?");
    let mut q = sqlx::query_as::<_, FeedRow>(&sql);
    for b in &binds {
        q = q.bind(b);
    }
    Ok(q.bind(limit).fetch_all(db).await?)
}

/// Valores distintos para os filtros (sem aplicar filtros): (atores, repositórios, tipos).
pub async fn feed_filter_values(db: &SqlitePool, server_id: &str) -> ApiResult<(Vec<String>, Vec<String>, Vec<String>)> {
    let linked = "repo_id IN (SELECT repo_id FROM server_github_repos WHERE server_id = ?)";
    let actors: Vec<(String,)> = sqlx::query_as(&format!(
        "SELECT DISTINCT actor FROM (
           SELECT actor_login AS actor FROM github_events WHERE actor_login <> '' AND {linked}
           UNION SELECT u.username FROM server_members m JOIN users u ON u.id = m.user_id WHERE m.server_id = ?
           UNION SELECT 'Squak' FROM channels WHERE server_id = ?
         ) ORDER BY actor COLLATE NOCASE"
    ))
    .bind(server_id)
    .bind(server_id)
    .bind(server_id)
    .fetch_all(db)
    .await?;
    let repos: Vec<(String,)> = sqlx::query_as(&format!(
        "SELECT DISTINCT repo_full_name FROM github_events WHERE {linked} ORDER BY repo_full_name COLLATE NOCASE"
    ))
    .bind(server_id)
    .fetch_all(db)
    .await?;
    let kinds: Vec<(String,)> = sqlx::query_as(&format!(
        "SELECT DISTINCT kind FROM (
           SELECT kind FROM github_events WHERE {linked}
           UNION SELECT 'member_joined' FROM server_members WHERE server_id = ?
           UNION SELECT 'channel_created' FROM channels WHERE server_id = ?
         ) ORDER BY kind"
    ))
    .bind(server_id)
    .bind(server_id)
    .bind(server_id)
    .fetch_all(db)
    .await?;
    let flat = |v: Vec<(String,)>| v.into_iter().map(|r| r.0).collect::<Vec<_>>();
    Ok((flat(actors), flat(repos), flat(kinds)))
}
