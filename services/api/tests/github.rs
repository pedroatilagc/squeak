//! Integração GitHub: tudo contra `MockGitHub` e SQLite em memória (nenhuma chamada de rede).
use axum::{body::Body, http::{Request, StatusCode}, Router};
use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sha2::Sha256;
use sqlx::SqlitePool;
use squak_api::{
    config::{Config, GitHubConfig},
    github::{
        client::{mock::{MockGitHub, MOCK_ACCESS_TOKEN, MOCK_COLORS, MOCK_INSTALLATION_ID, MOCK_REFRESH_TOKEN}, GhError},
        crypto::TokenCipher,
    },
    router,
    state::{connect, AppState},
};
use std::sync::Arc;
use tower::ServiceExt;

const WH_SECRET: &str = "segredo-do-webhook-de-teste";

fn key_b64() -> String {
    STANDARD.encode([7u8; 32])
}

struct Ctx {
    app: Router,
    state: AppState,
    mock: Arc<MockGitHub>,
    db: SqlitePool,
}

async fn ctx() -> Ctx {
    let db = connect("sqlite::memory:").await.unwrap();
    let cfg = Config {
        github: GitHubConfig {
            client_id: "cid".into(),
            client_secret: "csec".into(),
            app_slug: "squak-test".into(),
            webhook_secret: WH_SECRET.into(),
            token_key: key_b64(),
            mock: true,
            ..Default::default()
        },
        ..Default::default()
    };
    let mock = Arc::new(MockGitHub::new());
    let state = AppState::with_github(db.clone(), cfg, mock.clone());
    Ctx { app: router(state.clone()), state, mock, db }
}

async fn call(app: &Router, method: &str, uri: &str, token: Option<&str>, body: Option<Value>) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    let body = match body {
        Some(b) => {
            req = req.header("content-type", "application/json");
            Body::from(b.to_string())
        }
        None => Body::empty(),
    };
    let res = app.clone().oneshot(req.body(body).unwrap()).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn register(app: &Router, name: &str) -> (String, String) {
    let (st, v) = call(app, "POST", "/auth/register", None, Some(json!({"username": name, "password": "senha-forte-123"}))).await;
    assert_eq!(st, StatusCode::OK, "{v}");
    (v["token"].as_str().unwrap().into(), v["user"]["id"].as_str().unwrap().into())
}

/// (server_id, canal de texto, canal de voz)
async fn make_server(app: &Router, token: &str) -> (String, String, String) {
    let (st, v) = call(app, "POST", "/servers", Some(token), Some(json!({"name": "Squad"}))).await;
    assert_eq!(st, StatusCode::OK);
    let sid = v["id"].as_str().unwrap().to_string();
    let (_, d) = call(app, "GET", &format!("/servers/{sid}"), Some(token), None).await;
    let ch = |kind: &str| d["channels"].as_array().unwrap().iter().find(|c| c["kind"] == kind).unwrap()["id"].as_str().unwrap().to_string();
    (sid, ch("text"), ch("voice"))
}

/// Conecta o GitHub do usuário pelo device flow (mock: 1º poll pendente, 2º conectado).
async fn connect_github(app: &Router, token: &str) {
    let (st, f) = call(app, "POST", "/integrations/github/device", Some(token), None).await;
    assert_eq!(st, StatusCode::OK, "{f}");
    let body = json!({ "flow_id": f["flow_id"] });
    let (_, p) = call(app, "POST", "/integrations/github/device/poll", Some(token), Some(body.clone())).await;
    assert_eq!(p["status"], "pending");
    let (_, p) = call(app, "POST", "/integrations/github/device/poll", Some(token), Some(body)).await;
    assert_eq!(p["status"], "connected");
}

async fn join_as_member(app: &Router, owner: &str, sid: &str, member: &str) {
    let (_, inv) = call(app, "POST", &format!("/servers/{sid}/invites"), Some(owner), None).await;
    let code = inv["code"].as_str().unwrap();
    let (st, _) = call(app, "POST", &format!("/invites/{code}/join"), Some(member), None).await;
    assert_eq!(st, StatusCode::OK);
}

fn sign(secret: &str, body: &[u8]) -> String {
    let mut m = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    m.update(body);
    format!("sha256={}", hex::encode(m.finalize().into_bytes()))
}

async fn webhook_raw(app: &Router, event: &str, delivery: &str, body: Vec<u8>, sig: Option<String>) -> (StatusCode, Value) {
    let mut req = Request::builder().method("POST").uri("/webhooks/github")
        .header("content-type", "application/json")
        .header("x-github-event", event)
        .header("x-github-delivery", delivery);
    if let Some(s) = sig {
        req = req.header("x-hub-signature-256", s);
    }
    let res = app.clone().oneshot(req.body(Body::from(body)).unwrap()).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn webhook(app: &Router, event: &str, delivery: &str, payload: &Value) -> (StatusCode, Value) {
    let body = payload.to_string().into_bytes();
    let sig = sign(WH_SECRET, &body);
    webhook_raw(app, event, delivery, body, Some(sig)).await
}

async fn count(db: &SqlitePool, table: &str) -> i64 {
    sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}")).fetch_one(db).await.unwrap()
}

// ---------- payloads de webhook ----------

const REPO_ID: i64 = 5001;
const REPO: &str = "mock-org/api";

fn repo() -> Value {
    json!({ "id": REPO_ID, "full_name": REPO, "html_url": format!("https://github.com/{REPO}") })
}

fn sender(login: &str) -> Value {
    json!({ "login": login, "avatar_url": format!("https://a/{login}.png") })
}

fn pr_obj(number: i64, sha: &str, updated: &str) -> Value {
    json!({
        "number": number, "node_id": format!("PR_{number}"), "title": format!("PR {number}"),
        "html_url": format!("https://github.com/{REPO}/pull/{number}"), "state": "open", "draft": false, "merged": false,
        "user": sender("ana"), "head": { "ref": "feat/x", "sha": sha }, "base": { "ref": "main" },
        "created_at": "2026-01-01T10:00:00Z", "updated_at": updated
    })
}

fn wh_pr(action: &str, pr: Value, who: &str) -> Value {
    json!({ "action": action, "pull_request": pr, "repository": repo(), "sender": sender(who) })
}

fn wh_review(state: &str, id: i64, pr: Value, reviewer: &str, at: &str) -> Value {
    json!({
        "action": "submitted", "pull_request": pr, "repository": repo(), "sender": sender(reviewer),
        "review": { "id": id, "state": state, "user": sender(reviewer), "submitted_at": at,
                    "html_url": format!("https://github.com/{REPO}/pull/1#review-{id}") }
    })
}

fn wh_suite(sha: &str, id: i64, app: &str, conclusion: &str, at: &str) -> Value {
    json!({
        "action": "completed", "repository": repo(), "sender": sender("ci"),
        "check_suite": { "id": id, "head_sha": sha, "status": "completed", "conclusion": conclusion,
                         "app": { "name": app }, "updated_at": at }
    })
}

fn wh_push(after: &str, n_commits: usize) -> Value {
    let commits: Vec<Value> = (0..n_commits).map(|i| json!({ "id": format!("c{i}") })).collect();
    json!({
        "ref": "refs/heads/main", "before": "0".repeat(40), "after": after, "commits": commits,
        "head_commit": { "timestamp": "2026-01-02T10:00:00-03:00" },
        "compare": format!("https://github.com/{REPO}/compare/x...y"),
        "repository": repo(), "sender": sender("ana")
    })
}

fn wh_issue(number: i64, updated: &str) -> Value {
    json!({
        "action": "opened", "repository": repo(), "sender": sender("ana"),
        "issue": { "number": number, "title": format!("Issue {number}"), "state": "open",
                   "html_url": format!("https://github.com/{REPO}/issues/{number}"),
                   "created_at": updated, "updated_at": updated }
    })
}

/// Dono conectado ao GitHub, servidor com o repositório 5001 vinculado ao canal de texto.
/// Devolve (token, server_id, canal de texto, canal de voz).
async fn linked_server(c: &Ctx) -> (String, String, String, String) {
    let (tok, _) = register(&c.app, "ana").await;
    connect_github(&c.app, &tok).await;
    let (sid, text, voice) = make_server(&c.app, &tok).await;
    let (st, v) = call(&c.app, "PUT", &format!("/servers/{sid}/github/repos"), Some(&tok), Some(json!({
        "installation_id": MOCK_INSTALLATION_ID, "repos": [{ "id": REPO_ID, "full_name": REPO }], "activity_channel_id": text
    }))).await;
    assert_eq!(st, StatusCode::OK, "{v}");
    (tok, sid, text, voice)
}

// ---------- configuração, conexão e segurança dos tokens ----------

#[tokio::test]
async fn unconfigured_returns_503_with_code() {
    let db = connect("sqlite::memory:").await.unwrap();
    // Sem credenciais e sem GITHUB_MOCK: cliente real, mas nunca chamado.
    let app = router(AppState::new(db.clone(), Config::default()));
    let (tok, _) = register(&app, "ana").await;
    for (m, uri) in [("GET", "/github/profile"), ("GET", "/github/contributions"), ("GET", "/github/activity"),
                     ("GET", "/github/pull-requests"), ("GET", "/github/installations"), ("POST", "/integrations/github/device")] {
        let (st, v) = call(&app, m, uri, Some(&tok), None).await;
        assert_eq!(st, StatusCode::SERVICE_UNAVAILABLE, "{uri}");
        assert_eq!(v["code"], "github_unconfigured", "{uri}");
    }
    let (st, v) = call(&app, "GET", "/integrations", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    let list = v["integrations"].as_array().unwrap();
    assert_eq!(list[0]["provider"], "github");
    assert_eq!(list[0]["status"], "unconfigured");
    assert_eq!(list[0]["mock"], false);
    assert_eq!(list[1]["provider"], "jira");
    assert_eq!(list[1]["status"], "planned");
    // Webhook sem segredo configurado: 503.
    let (st, _) = webhook_raw(&app, "ping", "d1", b"{}".to_vec(), Some(sign("qualquer", b"{}"))).await;
    assert_eq!(st, StatusCode::SERVICE_UNAVAILABLE);

    // Credenciais sem chave de cifra válida também é "unconfigured".
    let cfg = Config { github: GitHubConfig { client_id: "a".into(), client_secret: "b".into(), token_key: "curta".into(), ..Default::default() }, ..Default::default() };
    let app2 = router(AppState::new(db, cfg));
    let (tok2, _) = register(&app2, "bob").await;
    let (st, v) = call(&app2, "GET", "/github/profile", Some(&tok2), None).await;
    assert_eq!((st, v["code"].as_str()), (StatusCode::SERVICE_UNAVAILABLE, Some("github_unconfigured")));
}

#[tokio::test]
async fn disconnected_returns_409_with_code() {
    let c = ctx().await;
    let (tok, _) = register(&c.app, "ana").await;
    for uri in ["/github/profile", "/github/contributions", "/github/activity", "/github/pull-requests", "/github/installations"] {
        let (st, v) = call(&c.app, "GET", uri, Some(&tok), None).await;
        assert_eq!(st, StatusCode::CONFLICT, "{uri}");
        assert_eq!(v["code"], "github_disconnected", "{uri}");
    }
    let (_, v) = call(&c.app, "GET", "/integrations", Some(&tok), None).await;
    assert_eq!(v["integrations"][0]["status"], "disconnected");
    assert_eq!(v["integrations"][0]["install_url"], "https://github.com/apps/squak-test/installations/new");
    let (st, _) = call(&c.app, "GET", "/github/profile", None, None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn device_flow_connects_and_tokens_are_encrypted_at_rest() {
    let c = ctx().await;
    let (tok, _) = register(&c.app, "ana").await;
    let (_, other) = register(&c.app, "bob").await;
    let _ = other;
    let (st, f) = call(&c.app, "POST", "/integrations/github/device", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(f["user_code"], "MOCK-1234");
    assert_eq!(f["verification_uri"], "https://github.com/login/device");
    assert_eq!(f["interval"], 5);
    assert!(f["expires_in"].as_i64().unwrap() > 0);

    // O device_code também fica cifrado.
    let (enc,): (String,) = sqlx::query_as("SELECT device_code_enc FROM github_device_flows").fetch_one(&c.db).await.unwrap();
    assert!(!enc.contains("mock-device"));

    let body = json!({ "flow_id": f["flow_id"] });
    let (st, p) = call(&c.app, "POST", "/integrations/github/device/poll", Some(&tok), Some(body.clone())).await;
    assert_eq!((st, p["status"].as_str(), p["interval"].as_i64()), (StatusCode::OK, Some("pending"), Some(5)));
    let (st, p) = call(&c.app, "POST", "/integrations/github/device/poll", Some(&tok), Some(body.clone())).await;
    assert_eq!((st, p["status"].as_str()), (StatusCode::OK, Some("connected")));
    assert_eq!(count(&c.db, "github_device_flows").await, 0, "fluxo concluído é apagado");
    // Fluxo apagado: novo poll não existe mais.
    let (st, _) = call(&c.app, "POST", "/integrations/github/device/poll", Some(&tok), Some(body)).await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    let (_, v) = call(&c.app, "GET", "/integrations", Some(&tok), None).await;
    assert_eq!(v["integrations"][0]["status"], "connected");
    assert_eq!(v["integrations"][0]["mock"], true);
    assert_eq!(v["integrations"][0]["account"]["login"], "mock-octocat");
    assert!(!v.to_string().contains(MOCK_ACCESS_TOKEN), "token nunca vai ao cliente");

    // Nada em texto puro no banco: nem o token, nem o refresh.
    let (a, r): (String, Option<String>) = sqlx::query_as("SELECT access_token_enc, refresh_token_enc FROM github_accounts")
        .fetch_one(&c.db).await.unwrap();
    let r = r.unwrap();
    for raw in [MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN] {
        assert!(!a.contains(raw) && !r.contains(raw));
    }
    let cipher = TokenCipher::from_base64_key(&key_b64()).unwrap();
    assert_eq!(cipher.decrypt(&a).unwrap(), MOCK_ACCESS_TOKEN);
    assert_eq!(cipher.decrypt(&r).unwrap(), MOCK_REFRESH_TOKEN);
    let dump: String = sqlx::query_scalar("SELECT group_concat(login || '|' || access_token_enc || '|' || ifnull(refresh_token_enc,''), ';') FROM github_accounts")
        .fetch_one(&c.db).await.unwrap();
    assert!(!dump.contains("NAO-VAZAR"));

    // Outro usuário não consegue usar o fluxo alheio.
    let (st, f2) = call(&c.app, "POST", "/integrations/github/device", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    let (btok, _) = register(&c.app, "carl").await;
    let (st, _) = call(&c.app, "POST", "/integrations/github/device/poll", Some(&btok), Some(json!({ "flow_id": f2["flow_id"] }))).await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // Desconectar revoga, apaga e é idempotente.
    let (st, v) = call(&c.app, "DELETE", "/integrations/github", Some(&tok), None).await;
    assert_eq!((st, v["ok"].as_bool()), (StatusCode::OK, Some(true)));
    assert_eq!(c.mock.revoke_calls(), 1);
    assert_eq!(count(&c.db, "github_accounts").await, 0);
    let (st, _) = call(&c.app, "DELETE", "/integrations/github", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    let (_, v) = call(&c.app, "GET", "/integrations", Some(&tok), None).await;
    assert_eq!(v["integrations"][0]["status"], "disconnected");
}

#[tokio::test]
async fn reauth_required_refresh_and_upstream_errors() {
    let c = ctx().await;
    let (tok, _) = register(&c.app, "ana").await;
    connect_github(&c.app, &tok).await;

    // Token expirado: renova sozinho com o refresh token.
    sqlx::query("UPDATE github_accounts SET access_expires_at = 1").execute(&c.db).await.unwrap();
    let (st, _) = call(&c.app, "GET", "/github/profile", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(c.mock.refresh_calls(), 1);
    let (exp,): (i64,) = sqlx::query_as("SELECT access_expires_at FROM github_accounts").fetch_one(&c.db).await.unwrap();
    assert!(exp > 1_000_000_000_000, "nova expiração gravada");
    let (st, _) = call(&c.app, "GET", "/github/profile", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(c.mock.refresh_calls(), 1, "token válido não renova");

    // Erros do GitHub mapeados para códigos estáveis, sem detalhes.
    c.mock.fail_with(Some(GhError::RateLimited));
    let (st, v) = call(&c.app, "GET", "/github/profile", Some(&tok), None).await;
    assert_eq!((st, v["code"].as_str()), (StatusCode::TOO_MANY_REQUESTS, Some("github_rate_limited")));
    c.mock.fail_with(Some(GhError::Upstream));
    let (st, v) = call(&c.app, "GET", "/github/contributions", Some(&tok), None).await;
    assert_eq!((st, v["code"].as_str()), (StatusCode::BAD_GATEWAY, Some("github_upstream")));
    assert_eq!(v["error"], "falha ao consultar o GitHub");

    // Refresh recusado: conta vira reauth_required.
    c.mock.fail_with(None);
    sqlx::query("UPDATE github_accounts SET access_expires_at = 1").execute(&c.db).await.unwrap();
    c.mock.set_refresh_fails(true);
    let (st, v) = call(&c.app, "GET", "/github/profile", Some(&tok), None).await;
    assert_eq!((st, v["code"].as_str()), (StatusCode::CONFLICT, Some("github_reauth_required")));
    let (_, i) = call(&c.app, "GET", "/integrations", Some(&tok), None).await;
    assert_eq!(i["integrations"][0]["status"], "reauth_required");
    c.mock.set_refresh_fails(false);
    let (st, v) = call(&c.app, "GET", "/github/profile", Some(&tok), None).await;
    assert_eq!((st, v["code"].as_str()), (StatusCode::CONFLICT, Some("github_reauth_required")), "continua marcada até reconectar");

    // Reconectar limpa o estado.
    connect_github(&c.app, &tok).await;
    let (st, _) = call(&c.app, "GET", "/github/profile", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);

    // 401 do GitHub numa chamada de dados também marca a conta.
    c.mock.fail_with(Some(GhError::Unauthorized));
    let (st, v) = call(&c.app, "GET", "/github/pull-requests", Some(&tok), None).await;
    assert_eq!((st, v["code"].as_str()), (StatusCode::CONFLICT, Some("github_reauth_required")));
    c.mock.fail_with(None);
    let (_, i) = call(&c.app, "GET", "/integrations", Some(&tok), None).await;
    assert_eq!(i["integrations"][0]["status"], "reauth_required");
}

// ---------- perfil, contribuições, atividade e PRs pessoais ----------

#[tokio::test]
async fn profile_contributions_activity_and_pull_requests_follow_the_contract() {
    let c = ctx().await;
    let (tok, _) = register(&c.app, "ana").await;
    connect_github(&c.app, &tok).await;

    let (st, p) = call(&c.app, "GET", "/github/profile", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(p["mock"], true);
    assert_eq!(p["login"], "mock-octocat");
    for k in ["name", "avatar_url", "bio", "html_url", "company", "location", "followers", "following", "public_repos", "created_at"] {
        assert!(p.get(k).is_some(), "falta {k}");
    }
    assert!(p["repositories"].as_array().unwrap().len() <= 6);
    assert!(p["repositories"][0]["primary_language"]["color"].is_string());
    let langs = p["languages"].as_array().unwrap();
    assert!(!langs.is_empty() && langs.len() <= 8);
    let total: f64 = langs.iter().map(|l| l["percent"].as_f64().unwrap()).sum();
    assert!((total - 100.0).abs() < 0.5, "percentuais somam ~100 ({total})");

    // Intervalo domingo -> sábado: semanas completas.
    let (st, v) = call(&c.app, "GET", "/github/contributions?from=2025-01-05&to=2025-12-27T23:59:59Z", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK, "{v}");
    assert_eq!(v["mock"], true);
    assert_eq!(v["from"], "2025-01-05T00:00:00Z");
    let colors: Vec<&str> = v["colors"].as_array().unwrap().iter().map(|x| x.as_str().unwrap()).collect();
    assert_eq!(colors, MOCK_COLORS, "cores vêm do cliente, não são inventadas pela API");
    let levels = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];
    let weeks = v["weeks"].as_array().unwrap();
    assert!(weeks.len() >= 51);
    let mut sum = 0;
    for w in weeks {
        let days = w["days"].as_array().unwrap();
        assert_eq!(days.len(), 7, "semana de 7 dias");
        assert_eq!(w["first_day"], days[0]["date"]);
        assert_eq!(days[0]["weekday"], 0, "semana começa no domingo");
        for (i, d) in days.iter().enumerate() {
            assert_eq!(d["weekday"], i);
            let lvl = levels.iter().position(|l| *l == d["level"].as_str().unwrap()).expect("nível válido");
            assert_eq!(d["color"], colors[lvl], "cor do dia = cor do nível");
            sum += d["count"].as_u64().unwrap();
        }
    }
    assert_eq!(v["total_contributions"].as_u64().unwrap(), sum);
    for k in ["total_commits", "total_issues", "total_pull_requests", "total_reviews", "restricted_contributions", "has_restricted"] {
        assert!(v.get(k).is_some(), "falta {k}");
    }

    // Padrão: último ano; só a última semana pode ser parcial.
    let (_, d) = call(&c.app, "GET", "/github/contributions", Some(&tok), None).await;
    let ws = d["weeks"].as_array().unwrap();
    assert!(ws[..ws.len() - 1].iter().skip(1).all(|w| w["days"].as_array().unwrap().len() == 7));
    assert!((1..=7).contains(&ws.last().unwrap()["days"].as_array().unwrap().len()));

    // Intervalos inválidos.
    for q in ["from=2023-01-01&to=2025-01-01", "from=2025-02-01&to=2025-01-01", "from=lixo", "to=2025-13-45"] {
        let (st, _) = call(&c.app, "GET", &format!("/github/contributions?{q}"), Some(&tok), None).await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "{q}");
    }

    // Atividade pessoal.
    let (st, a) = call(&c.app, "GET", "/github/activity?from=2026-10-01&to=2026-11-01", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(a["mock"], true);
    assert_eq!(a["truncated"], false);
    let items = a["items"].as_array().unwrap();
    assert_eq!(items.len(), 5);
    let times: Vec<&str> = items.iter().map(|i| i["occurred_at"].as_str().unwrap()).collect();
    assert!(times.windows(2).all(|w| w[0] >= w[1]), "ordem decrescente");
    for i in items {
        for k in ["id", "type", "title", "repo", "url", "occurred_at"] {
            assert!(i[k].is_string(), "falta {k}");
        }
        assert!(i["author"]["login"].is_string());
    }
    assert_eq!(items.iter().find(|i| i["type"] == "commit").unwrap()["detail"]["count"], 3);
    assert_eq!(items.iter().find(|i| i["type"] == "pull_request").unwrap()["detail"]["number"], 12);
    let (_, a) = call(&c.app, "GET", "/github/activity?types=review,issue&limit=1", Some(&tok), None).await;
    assert_eq!(a["items"].as_array().unwrap().len(), 1);
    assert_eq!(a["truncated"], true, "limite menor que o total marca truncated");
    assert!(["review", "issue"].contains(&a["items"][0]["type"].as_str().unwrap()));
    let (st, _) = call(&c.app, "GET", "/github/activity?types=commit,xyz", Some(&tok), None).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // PRs do usuário.
    let (st, pr) = call(&c.app, "GET", "/github/pull-requests", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(pr["mock"], true);
    let times: Vec<&str> = pr["items"].as_array().unwrap().iter().map(|i| i["updated_at"].as_str().unwrap()).collect();
    assert!(times.windows(2).all(|w| w[0] >= w[1]), "mais recentes primeiro");
    let first = pr["items"].as_array().unwrap().iter().find(|i| i["number"] == 12).unwrap();
    for k in ["id", "number", "title", "url", "repo", "author", "head_ref", "base_ref", "state", "is_draft", "review_status", "reviewers", "approvals", "checks", "created_at", "updated_at"] {
        assert!(first.get(k).is_some(), "falta {k}");
    }
    assert_eq!(first["checks"]["state"], "pending");
    assert_eq!(first["state"], "open", "estado do PR e dos checks são campos separados");
    let (_, rr) = call(&c.app, "GET", "/github/pull-requests?role=review_requested", Some(&tok), None).await;
    assert_eq!(rr["items"][0]["checks"]["state"], "none");
    let (st, _) = call(&c.app, "GET", "/github/pull-requests?role=outro", Some(&tok), None).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
}

// ---------- webhook: segurança e idempotência ----------

#[tokio::test]
async fn webhook_rejects_missing_or_bad_signature_before_parsing() {
    let c = ctx().await;
    let (_tok, _sid, _t, _v) = linked_server(&c).await;
    let body = wh_push(&"a".repeat(40), 1).to_string().into_bytes();

    let (st, _) = webhook_raw(&c.app, "push", "d-nosig", body.clone(), None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "assinatura ausente");
    let (st, _) = webhook_raw(&c.app, "push", "d-bad", body.clone(), Some(sign("outro-segredo", &body))).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "assinatura de outro segredo");
    let (st, _) = webhook_raw(&c.app, "push", "d-fmt", body.clone(), Some("sha1=abc".into())).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "formato inválido");
    let (st, _) = webhook_raw(&c.app, "push", "d-hex", body.clone(), Some("sha256=zzzz".into())).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "hex inválido");
    let mut tampered = body.clone();
    tampered[5] ^= 0x01;
    let (st, _) = webhook_raw(&c.app, "push", "d-tamper", tampered, Some(sign(WH_SECRET, &body))).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "corpo adulterado");
    // JSON inválido só é visto depois da assinatura: assinatura ruim + JSON ruim ainda é 401.
    let (st, _) = webhook_raw(&c.app, "push", "d-junk", b"nao-e-json".to_vec(), Some("sha256=00".into())).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    let junk = b"nao-e-json".to_vec();
    let (st, _) = webhook_raw(&c.app, "push", "d-junk2", junk.clone(), Some(sign(WH_SECRET, &junk))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(count(&c.db, "github_events").await, 0);
    assert_eq!(count(&c.db, "github_deliveries").await, 0, "rejeitadas não deixam rastro");
}

#[tokio::test]
async fn webhook_is_idempotent_by_delivery_and_by_domain_event() {
    let c = ctx().await;
    let (tok, sid, _t, _v) = linked_server(&c).await;
    let after = "b".repeat(40);

    let (st, v) = webhook(&c.app, "push", "delivery-1", &wh_push(&after, 2)).await;
    assert_eq!((st, v["ok"].as_bool(), v.get("duplicate")), (StatusCode::OK, Some(true), None));
    assert_eq!(count(&c.db, "github_events").await, 1);

    // Mesma entrega repetida (retry do GitHub).
    let (st, v) = webhook(&c.app, "push", "delivery-1", &wh_push(&after, 2)).await;
    assert_eq!((st, v["duplicate"].as_bool()), (StatusCode::OK, Some(true)));
    assert_eq!(count(&c.db, "github_events").await, 1);
    assert_eq!(count(&c.db, "github_deliveries").await, 1);

    // Novo delivery com os mesmos commits (redeliver manual / outro webhook): dedupe_key evita o evento duplicado.
    let (st, v) = webhook(&c.app, "push", "delivery-2", &wh_push(&after, 2)).await;
    assert_eq!((st, v["ok"].as_bool()), (StatusCode::OK, Some(true)));
    assert_eq!(count(&c.db, "github_events").await, 1);
    let (_, feed) = call(&c.app, "GET", &format!("/servers/{sid}/activity?kind=push"), Some(&tok), None).await;
    let pushes = feed["items"].as_array().unwrap();
    assert_eq!(pushes.len(), 1);
    assert_eq!(pushes[0]["source"], "github");
    assert_eq!(pushes[0]["title"], "ana enviou 2 commits para main");
    assert_eq!(pushes[0]["occurred_at"], "2026-01-02T13:00:00Z", "offset do GitHub normalizado para UTC");
    assert_eq!(pushes[0]["repo"], REPO);

    // Push diferente é outro evento.
    let (st, _) = webhook(&c.app, "push", "delivery-3", &wh_push(&"c".repeat(40), 1)).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(count(&c.db, "github_events").await, 2);

    // Repositório não vinculado: ignorado e nada gravado.
    let mut other = wh_push(&"d".repeat(40), 1);
    other["repository"] = json!({ "id": 777, "full_name": "outro/repo" });
    let (st, v) = webhook(&c.app, "push", "delivery-4", &other).await;
    assert_eq!((st, v["ignored"].as_bool()), (StatusCode::OK, Some(true)));
    assert_eq!(count(&c.db, "github_events").await, 2);
    // Evento sem tratamento (ping, star...) também é ignorado.
    let (st, v) = webhook(&c.app, "star", "delivery-5", &json!({ "repository": repo() })).await;
    assert_eq!((st, v["ignored"].as_bool()), (StatusCode::OK, Some(true)));
}

#[tokio::test]
async fn webhook_publishes_events_to_the_hub() {
    let c = ctx().await;
    let (_tok, sid, _t, _v) = linked_server(&c).await;
    let mut rx = c.state.hub.subscribe();
    webhook(&c.app, "pull_request", "p1", &wh_pr("opened", pr_obj(1, &"1".repeat(40), "2026-01-01T10:00:00Z"), "ana")).await;
    let mut seen = Vec::new();
    while let Ok(Ok(e)) = tokio::time::timeout(std::time::Duration::from_millis(300), rx.recv()).await {
        if e.server_id == sid {
            seen.push(e.payload.clone());
        }
    }
    let ev = seen.iter().find(|p| p["type"] == "github.event").expect("github.event publicado");
    assert_eq!(ev["server_id"], sid.as_str());
    assert_eq!(ev["item"]["kind"], "pull_request");
    assert_eq!(ev["item"]["title"], "ana abriu PR #1");
    let up = seen.iter().find(|p| p["type"] == "github.pr_updated").expect("github.pr_updated publicado");
    assert_eq!((up["repo"].as_str(), up["number"].as_i64()), (Some(REPO), Some(1)));

    // Entrega duplicada não publica de novo.
    webhook(&c.app, "pull_request", "p1", &wh_pr("opened", pr_obj(1, &"1".repeat(40), "2026-01-01T10:00:00Z"), "ana")).await;
    assert!(tokio::time::timeout(std::time::Duration::from_millis(200), rx.recv()).await.is_err());
}

// ---------- cards de PR do servidor ----------

#[tokio::test]
async fn pr_card_keeps_lifecycle_review_and_checks_separate() {
    let c = ctx().await;
    let (tok, sid, _t, _v) = linked_server(&c).await;
    let sha = "e".repeat(40);
    let prs = format!("/servers/{sid}/pull-requests");

    webhook(&c.app, "pull_request", "d1", &wh_pr("opened", pr_obj(1, &sha, "2026-01-01T10:00:00Z"), "ana")).await;
    let (st, v) = call(&c.app, "GET", &prs, Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    let card = &v["items"][0];
    assert_eq!((card["state"].as_str(), card["review_status"].as_str(), card["checks"]["state"].as_str()), (Some("open"), Some("none"), Some("none")));
    assert_eq!(card["checks"]["total"], 0);
    assert_eq!(card["id"], "PR_1");
    assert_eq!(card["author"]["login"], "ana");
    assert_eq!((card["head_ref"].as_str(), card["base_ref"].as_str()), (Some("feat/x"), Some("main")));

    // Review aprovada: muda só review_status.
    webhook(&c.app, "pull_request_review", "d2", &wh_review("approved", 11, pr_obj(1, &sha, "2026-01-01T11:00:00Z"), "bob", "2026-01-01T11:00:00Z")).await;
    let (_, v) = call(&c.app, "GET", &prs, Some(&tok), None).await;
    let card = &v["items"][0];
    assert_eq!((card["state"].as_str(), card["review_status"].as_str(), card["approvals"].as_i64()), (Some("open"), Some("approved"), Some(1)));
    assert_eq!(card["reviewers"][0]["login"], "bob");
    assert_eq!(card["reviewers"][0]["state"], "APPROVED");
    assert_eq!(card["checks"]["state"], "none");

    // Comentário posterior do mesmo revisor não derruba a aprovação.
    webhook(&c.app, "pull_request_review", "d3", &wh_review("commented", 12, pr_obj(1, &sha, "2026-01-01T11:30:00Z"), "bob", "2026-01-01T11:30:00Z")).await;
    let (_, v) = call(&c.app, "GET", &prs, Some(&tok), None).await;
    assert_eq!(v["items"][0]["review_status"], "approved");

    // CI falhando: só checks.state muda.
    webhook(&c.app, "check_suite", "d4", &wh_suite(&sha, 90, "CI Externo", "failure", "2026-01-01T12:00:00Z")).await;
    let (_, v) = call(&c.app, "GET", &prs, Some(&tok), None).await;
    let card = &v["items"][0];
    assert_eq!((card["state"].as_str(), card["review_status"].as_str()), (Some("open"), Some("approved")));
    assert_eq!((card["checks"]["state"].as_str(), card["checks"]["total"].as_i64()), (Some("failure"), Some(1)));

    // Reexecução passa: o mesmo check é substituído, não somado.
    webhook(&c.app, "check_suite", "d5", &wh_suite(&sha, 91, "CI Externo", "success", "2026-01-01T12:30:00Z")).await;
    let (_, v) = call(&c.app, "GET", &prs, Some(&tok), None).await;
    assert_eq!((v["items"][0]["checks"]["state"].as_str(), v["items"][0]["checks"]["total"].as_i64()), (Some("success"), Some(1)));

    // Pedido de mudanças tem precedência sobre aprovação de outro revisor.
    webhook(&c.app, "pull_request_review", "d6", &wh_review("changes_requested", 13, pr_obj(1, &sha, "2026-01-01T13:00:00Z"), "cy", "2026-01-01T13:00:00Z")).await;
    let (_, v) = call(&c.app, "GET", &prs, Some(&tok), None).await;
    assert_eq!(v["items"][0]["review_status"], "changes_requested");
    assert_eq!(v["items"][0]["approvals"], 1);

    // Entrega fora de ordem (mais antiga) não regride o card.
    let mut newer = pr_obj(1, &sha, "2026-01-01T15:00:00Z");
    newer["title"] = json!("Título novo");
    webhook(&c.app, "pull_request", "d7", &wh_pr("edited", newer, "ana")).await;
    let mut older = pr_obj(1, &sha, "2026-01-01T14:00:00Z");
    older["title"] = json!("Título velho");
    webhook(&c.app, "pull_request", "d8", &wh_pr("edited", older, "ana")).await;
    let (_, v) = call(&c.app, "GET", &prs, Some(&tok), None).await;
    assert_eq!(v["items"][0]["title"], "Título novo");

    // Merge: ciclo de vida muda, review/checks seguem como estavam.
    let mut merged = pr_obj(1, &sha, "2026-01-01T16:00:00Z");
    merged["state"] = json!("closed");
    merged["merged"] = json!(true);
    merged["merged_at"] = json!("2026-01-01T16:00:00Z");
    webhook(&c.app, "pull_request", "d9", &wh_pr("closed", merged, "ana")).await;
    let (_, v) = call(&c.app, "GET", &prs, Some(&tok), None).await;
    let card = &v["items"][0];
    assert_eq!((card["state"].as_str(), card["checks"]["state"].as_str(), card["review_status"].as_str()), (Some("merged"), Some("success"), Some("changes_requested")));
    let (_, feed) = call(&c.app, "GET", &format!("/servers/{sid}/activity?kind=pull_request"), Some(&tok), None).await;
    let actions: Vec<&str> = feed["items"].as_array().unwrap().iter().map(|i| i["action"].as_str().unwrap()).collect();
    assert_eq!(actions, vec!["merged", "opened"]);
}

#[tokio::test]
async fn pr_state_filters() {
    let c = ctx().await;
    let (tok, sid, _t, _v) = linked_server(&c).await;
    let sha = |n: i64| format!("{n:0>40}");
    let t = "2026-02-01T10:00:00Z";
    for n in 1..=6 {
        let mut pr = pr_obj(n, &sha(n), t);
        match n {
            3 => pr["draft"] = json!(true),
            5 => { pr["state"] = json!("closed"); pr["merged"] = json!(true); pr["merged_at"] = json!(t); }
            6 => pr["state"] = json!("closed"),
            _ => {}
        }
        let action = if n >= 5 { "closed" } else { "opened" };
        webhook(&c.app, "pull_request", &format!("o{n}"), &wh_pr(action, pr, "ana")).await;
    }
    webhook(&c.app, "pull_request_review", "r1", &wh_review("approved", 1, pr_obj(1, &sha(1), t), "bob", t)).await;
    webhook(&c.app, "pull_request_review", "r2", &wh_review("changes_requested", 2, pr_obj(2, &sha(2), t), "bob", t)).await;

    let numbers = |v: &Value| -> Vec<i64> {
        let mut n: Vec<i64> = v["items"].as_array().unwrap().iter().map(|i| i["number"].as_i64().unwrap()).collect();
        n.sort();
        n
    };
    let base = format!("/servers/{sid}/pull-requests");
    let expect = [("open", vec![1, 2, 3, 4]), ("in_review", vec![4]), ("approved", vec![1]),
                  ("changes_requested", vec![2]), ("merged", vec![5]), ("closed", vec![6])];
    for (state, want) in expect {
        let (st, v) = call(&c.app, "GET", &format!("{base}?state={state}"), Some(&tok), None).await;
        assert_eq!(st, StatusCode::OK);
        assert_eq!(numbers(&v), want, "state={state}");
    }
    let (_, all) = call(&c.app, "GET", &base, Some(&tok), None).await;
    assert_eq!(numbers(&all), vec![1, 2, 3, 4, 5, 6]);
    let (st, _) = call(&c.app, "GET", &format!("{base}?state=xyz"), Some(&tok), None).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
}

// ---------- feed de atividade ----------

#[tokio::test]
async fn activity_feed_filters_cursor_and_concord_events() {
    let c = ctx().await;
    let (tok, sid, _t, _v) = linked_server(&c).await;
    // Sem eventos do GitHub ainda: só os eventos do Squak (nada inventado).
    let (_, f0) = call(&c.app, "GET", &format!("/servers/{sid}/activity"), Some(&tok), None).await;
    assert!(f0["items"].as_array().unwrap().iter().all(|i| i["source"] == "concord"));

    webhook(&c.app, "push", "g1", &wh_push(&"a".repeat(40), 2)).await;
    // Dois eventos com exatamente o mesmo instante: o desempate por id mantém o cursor estável.
    webhook(&c.app, "issues", "g2", &wh_issue(4, "2026-01-03T09:00:00Z")).await;
    webhook(&c.app, "issues", "g3", &wh_issue(5, "2026-01-03T09:00:00Z")).await;
    webhook(&c.app, "pull_request", "g4", &wh_pr("opened", pr_obj(1, &"1".repeat(40), "2026-01-04T09:00:00Z"), "ana")).await;
    webhook(&c.app, "pull_request_review", "g5", &wh_review("approved", 7, pr_obj(1, &"1".repeat(40), "2026-01-05T09:00:00Z"), "bob", "2026-01-05T09:00:00Z")).await;

    let feed = format!("/servers/{sid}/activity");
    let (st, all) = call(&c.app, "GET", &format!("{feed}?limit=100"), Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    let items = all["items"].as_array().unwrap();
    // 5 do GitHub + 1 membro + 2 canais iniciais.
    assert_eq!(items.len(), 8);
    assert!(all["next_before"].is_null());
    let order: Vec<(&str, &str)> = items.iter().map(|i| (i["occurred_at"].as_str().unwrap(), i["id"].as_str().unwrap())).collect();
    assert!(order.windows(2).all(|w| w[0] >= w[1]), "ordem (occurred_at, id) decrescente");
    for i in items {
        assert!(i["id"].as_str().unwrap().starts_with("ev:"));
        assert!(["github", "concord"].contains(&i["source"].as_str().unwrap()));
        assert!(i["actor"]["name"].is_string() && i["title"].is_string());
    }
    let joined = items.iter().find(|i| i["kind"] == "member_joined").unwrap();
    assert_eq!(joined["source"], "concord");
    assert_eq!(joined["actor"]["name"], "ana");
    assert!(joined["actor"]["user_id"].is_string());
    assert_eq!(items.iter().filter(|i| i["kind"] == "channel_created").count(), 2);
    assert_eq!(all["filters"]["actors"], json!(["ana", "bob", "Squak"]));
    assert_eq!(all["filters"]["repos"], json!([REPO]));
    assert_eq!(all["filters"]["kinds"], json!(["channel_created", "issue", "member_joined", "pull_request", "push", "review"]));

    // Paginação com cursor: sem repetição nem buraco, mesmo com empate de horário.
    for limit in [1usize, 2, 3] {
        let mut got: Vec<String> = Vec::new();
        let mut cursor: Option<String> = None;
        for _ in 0..20 {
            let uri = match &cursor {
                Some(c) => format!("{feed}?limit={limit}&before={c}"),
                None => format!("{feed}?limit={limit}"),
            };
            let (st, page) = call(&c.app, "GET", &uri, Some(&tok), None).await;
            assert_eq!(st, StatusCode::OK, "{page}");
            got.extend(page["items"].as_array().unwrap().iter().map(|i| i["id"].as_str().unwrap().to_string()));
            // `filters` independe da página.
            assert_eq!(page["filters"], all["filters"]);
            match page["next_before"].as_str() {
                Some(n) => cursor = Some(n.to_string()),
                None => break,
            }
        }
        let want: Vec<String> = items.iter().map(|i| i["id"].as_str().unwrap().to_string()).collect();
        assert_eq!(got, want, "limit={limit}");
    }
    let (st, _) = call(&c.app, "GET", &format!("{feed}?before=%%%"), Some(&tok), None).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Filtros.
    let ids = |v: &Value| -> Vec<(String, String)> {
        v["items"].as_array().unwrap().iter().map(|i| (i["kind"].as_str().unwrap().into(), i["actor"]["name"].as_str().unwrap().into())).collect()
    };
    let (_, v) = call(&c.app, "GET", &format!("{feed}?kind=push"), Some(&tok), None).await;
    assert_eq!(ids(&v), vec![("push".to_string(), "ana".to_string())]);
    let (_, v) = call(&c.app, "GET", &format!("{feed}?actor=BOB"), Some(&tok), None).await;
    assert_eq!(ids(&v), vec![("review".to_string(), "bob".to_string())], "actor ignora maiúsculas");
    let (_, v) = call(&c.app, "GET", &format!("{feed}?repo=mock-org/api"), Some(&tok), None).await;
    assert_eq!(v["items"].as_array().unwrap().len(), 5, "repo exclui eventos do Squak");
    let (_, v) = call(&c.app, "GET", &format!("{feed}?kind=member_joined"), Some(&tok), None).await;
    assert_eq!(v["items"].as_array().unwrap().len(), 1);
    let (_, v) = call(&c.app, "GET", &format!("{feed}?actor=ana&kind=issue"), Some(&tok), None).await;
    assert_eq!(v["items"].as_array().unwrap().len(), 2);
    let (_, v) = call(&c.app, "GET", &format!("{feed}?actor=ninguem"), Some(&tok), None).await;
    assert_eq!(v["items"], json!([]));
}

// ---------- vínculos e permissões ----------

#[tokio::test]
async fn linking_permissions_and_isolation() {
    let c = ctx().await;
    let (ana, _) = register(&c.app, "ana").await;
    let (bob, _) = register(&c.app, "bob").await;
    let (carl, _) = register(&c.app, "carl").await;
    connect_github(&c.app, &ana).await;
    connect_github(&c.app, &bob).await;
    let (sid, text, voice) = make_server(&c.app, &ana).await;
    let (other_sid, other_text, _) = make_server(&c.app, &ana).await;
    join_as_member(&c.app, &ana, &sid, &bob).await;
    let put = |tok: String, sid: String, body: Value| {
        let app = c.app.clone();
        async move { call(&app, "PUT", &format!("/servers/{sid}/github/repos"), Some(&tok), Some(body)).await }
    };
    let ok_body = json!({ "installation_id": MOCK_INSTALLATION_ID, "repos": [{ "id": 5001, "full_name": "mock-org/api" }], "activity_channel_id": text });

    // Não-membro: 404 em tudo (não vaza a existência do servidor).
    for (m, uri) in [("GET", format!("/servers/{sid}/github")), ("GET", format!("/servers/{sid}/activity")),
                     ("GET", format!("/servers/{sid}/pull-requests")), ("DELETE", format!("/servers/{sid}/github/repos/x"))] {
        let (st, _) = call(&c.app, m, &uri, Some(&carl), None).await;
        assert_eq!(st, StatusCode::NOT_FOUND, "{uri}");
    }
    let (st, _) = put(carl.clone(), sid.clone(), ok_body.clone()).await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // Membro comum: lê, mas não administra.
    let (st, v) = call(&c.app, "GET", &format!("/servers/{sid}/github"), Some(&bob), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!((v["can_manage"].as_bool(), v["configured"].as_bool(), v["mock"].as_bool()), (Some(false), Some(true), Some(true)));
    assert_eq!(v["links"], json!([]));
    let (st, _) = put(bob.clone(), sid.clone(), ok_body.clone()).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, _) = call(&c.app, "DELETE", &format!("/servers/{sid}/github/repos/x"), Some(&bob), None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);

    // Admin sem GitHub conectado: 409.
    let (st, _) = call(&c.app, "PATCH", &format!("/servers/{sid}/members/{}", {
        let (_, d) = call(&c.app, "GET", &format!("/servers/{sid}"), Some(&ana), None).await;
        d["members"].as_array().unwrap().iter().find(|m| m["username"] == "bob").unwrap()["id"].as_str().unwrap().to_string()
    }), Some(&ana), Some(json!({ "role": "admin" }))).await;
    assert_eq!(st, StatusCode::OK);
    call(&c.app, "DELETE", "/integrations/github", Some(&bob), None).await;
    let (st, v) = put(bob.clone(), sid.clone(), ok_body.clone()).await;
    assert_eq!((st, v["code"].as_str()), (StatusCode::CONFLICT, Some("github_disconnected")));

    // Repositório que o token do usuário não enxerga: 403. Instalação desconhecida: 403.
    let (st, _) = put(ana.clone(), sid.clone(), json!({ "installation_id": MOCK_INSTALLATION_ID, "repos": [{ "id": 9999, "full_name": "alheio/segredo" }], "activity_channel_id": null })).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, _) = put(ana.clone(), sid.clone(), json!({ "installation_id": 42, "repos": [{ "id": 5001, "full_name": "x/y" }], "activity_channel_id": null })).await;
    assert_eq!(st, StatusCode::FORBIDDEN);

    // Canal inválido: de voz, de outro servidor ou inexistente.
    for ch in [voice.clone(), other_text.clone(), "nao-existe".to_string()] {
        let (st, _) = put(ana.clone(), sid.clone(), json!({ "installation_id": MOCK_INSTALLATION_ID, "repos": [{ "id": 5001, "full_name": "mock-org/api" }], "activity_channel_id": ch })).await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "canal {ch}");
    }
    assert_eq!(count(&c.db, "server_github_repos").await, 0, "nada gravado nas falhas");

    // Sucesso: o nome vem do GitHub, não do cliente.
    let (st, v) = put(ana.clone(), sid.clone(), json!({ "installation_id": MOCK_INSTALLATION_ID, "repos": [{ "id": 5001, "full_name": "falso/nome" }, { "id": 5001, "full_name": "falso/nome" }], "activity_channel_id": text })).await;
    assert_eq!(st, StatusCode::OK, "{v}");
    assert_eq!(v["can_manage"], true);
    assert_eq!(v["install_url"], "https://github.com/apps/squak-test/installations/new");
    let links = v["links"].as_array().unwrap();
    assert_eq!(links.len(), 1, "repo duplicado no corpo vira um vínculo");
    assert_eq!((links[0]["repo_full_name"].as_str(), links[0]["repo_id"].as_i64(), links[0]["installation_id"].as_i64()), (Some("mock-org/api"), Some(5001), Some(MOCK_INSTALLATION_ID)));
    assert_eq!(links[0]["activity_channel_id"], text.as_str());

    // Substitui os vínculos da instalação; lista vazia remove.
    let (st, v) = put(ana.clone(), sid.clone(), json!({ "installation_id": MOCK_INSTALLATION_ID, "repos": [{ "id": 5002, "full_name": "mock-org/web" }], "activity_channel_id": null })).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(v["links"].as_array().unwrap().len(), 1);
    assert_eq!(v["links"][0]["repo_full_name"], "mock-org/web");
    assert!(v["links"][0]["activity_channel_id"].is_null());

    // Vínculo de um servidor não vaza para outro.
    let (_, ov) = call(&c.app, "GET", &format!("/servers/{other_sid}/github"), Some(&ana), None).await;
    assert_eq!(ov["links"], json!([]));

    // Remoção por id (e só no servidor certo).
    let link_id = v["links"][0]["id"].as_str().unwrap().to_string();
    let (st, _) = call(&c.app, "DELETE", &format!("/servers/{other_sid}/github/repos/{link_id}"), Some(&ana), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, r) = call(&c.app, "DELETE", &format!("/servers/{sid}/github/repos/{link_id}"), Some(&ana), None).await;
    assert_eq!((st, r["ok"].as_bool()), (StatusCode::OK, Some(true)));
    let (st, _) = call(&c.app, "DELETE", &format!("/servers/{sid}/github/repos/{link_id}"), Some(&ana), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // Instalações e repositórios visíveis.
    let (st, i) = call(&c.app, "GET", "/github/installations", Some(&ana), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!((i["mock"].as_bool(), i["items"][0]["id"].as_i64(), i["items"][0]["account_login"].as_str()), (Some(true), Some(MOCK_INSTALLATION_ID), Some("mock-org")));
    let (st, r) = call(&c.app, "GET", &format!("/github/installations/{MOCK_INSTALLATION_ID}/repositories"), Some(&ana), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(r["items"].as_array().unwrap().len(), 2);
    let (st, _) = call(&c.app, "GET", "/github/installations/42/repositories", Some(&ana), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn webhook_events_do_not_cross_servers() {
    let c = ctx().await;
    let (ana, sid, _t, _v) = linked_server(&c).await;
    let (bob, _) = register(&c.app, "bob").await;
    let (bob_sid, _, _) = make_server(&c.app, &bob).await; // sem repositórios vinculados
    webhook(&c.app, "push", "x1", &wh_push(&"a".repeat(40), 1)).await;
    webhook(&c.app, "pull_request", "x2", &wh_pr("opened", pr_obj(1, &"1".repeat(40), "2026-01-01T10:00:00Z"), "ana")).await;
    let (_, mine) = call(&c.app, "GET", &format!("/servers/{sid}/activity?repo={REPO}"), Some(&ana), None).await;
    assert_eq!(mine["items"].as_array().unwrap().len(), 2);
    let (_, theirs) = call(&c.app, "GET", &format!("/servers/{bob_sid}/activity?repo={REPO}"), Some(&bob), None).await;
    assert_eq!(theirs["items"], json!([]));
    let (_, prs) = call(&c.app, "GET", &format!("/servers/{bob_sid}/pull-requests"), Some(&bob), None).await;
    assert_eq!(prs["items"], json!([]));
}
