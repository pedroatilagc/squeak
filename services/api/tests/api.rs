use axum::{body::Body, http::{Request, StatusCode}, Router};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use squak_api::{config::Config, router, state::{connect, AppState}};
use tower::ServiceExt;

async fn app() -> Router {
    let db = connect("sqlite::memory:").await.unwrap();
    let cfg = Config {
        bind: String::new(),
        database_url: String::new(),
        livekit_url: "ws://localhost:7880".into(),
        livekit_key: "k".into(),
        livekit_secret: "segredo-de-teste-com-tamanho-suficiente".into(),
        ..Default::default()
    };
    router(AppState::new(db, cfg))
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

/// Cria servidor e devolve (server_id, text_channel_id, voice_channel_id).
async fn make_server(app: &Router, token: &str) -> (String, String, String) {
    let (st, v) = call(app, "POST", "/servers", Some(token), Some(json!({"name": "Squad"}))).await;
    assert_eq!(st, StatusCode::OK);
    let sid = v["id"].as_str().unwrap().to_string();
    let (_, d) = call(app, "GET", &format!("/servers/{sid}"), Some(token), None).await;
    let ch = |kind: &str| d["channels"].as_array().unwrap().iter().find(|c| c["kind"] == kind).unwrap()["id"].as_str().unwrap().to_string();
    (sid, ch("text"), ch("voice"))
}

#[tokio::test]
async fn auth_register_login_logout_and_bruteforce() {
    let app = app().await;
    let (tok, _) = register(&app, "ana").await;
    let (st, _) = call(&app, "POST", "/auth/register", None, Some(json!({"username": "ANA", "password": "outra-senha-1"}))).await;
    assert_eq!(st, StatusCode::CONFLICT, "usuário é único sem diferenciar maiúsculas");
    let (st, _) = call(&app, "POST", "/auth/register", None, Some(json!({"username": "x", "password": "senha-forte-123"}))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = call(&app, "GET", "/me", Some(&tok), None).await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = call(&app, "GET", "/me", None, None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);

    let (st, v) = call(&app, "POST", "/auth/login", None, Some(json!({"username": "ana", "password": "senha-forte-123"}))).await;
    assert_eq!(st, StatusCode::OK);
    let tok2 = v["token"].as_str().unwrap().to_string();
    call(&app, "POST", "/auth/logout", Some(&tok2), None).await;
    let (st, _) = call(&app, "GET", "/me", Some(&tok2), None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "sessão revogada");

    for _ in 0..5 {
        let (st, _) = call(&app, "POST", "/auth/login", None, Some(json!({"username": "ana", "password": "errada"}))).await;
        assert_eq!(st, StatusCode::UNAUTHORIZED);
    }
    let (st, _) = call(&app, "POST", "/auth/login", None, Some(json!({"username": "ana", "password": "senha-forte-123"}))).await;
    assert_eq!(st, StatusCode::TOO_MANY_REQUESTS, "bloqueio após 5 falhas");
}

#[tokio::test]
async fn data_isolation_between_servers() {
    let app = app().await;
    let (a, _) = register(&app, "ana").await;
    let (b, _) = register(&app, "bob").await;
    let (sid, text, voice) = make_server(&app, &a).await;
    // Bob não é membro: nada vaza (404) e nada é permitido.
    let (st, _) = call(&app, "GET", &format!("/servers/{sid}"), Some(&b), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _) = call(&app, "GET", &format!("/channels/{text}/messages"), Some(&b), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _) = call(&app, "POST", &format!("/channels/{text}/messages"), Some(&b), Some(json!({"content": "oi"}))).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _) = call(&app, "POST", &format!("/channels/{voice}/voice-token"), Some(&b), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND, "não entra em sala só conhecendo o id");
    let (st, v) = call(&app, "GET", "/servers", Some(&b), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(v.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn invites_roles_and_channels() {
    let app = app().await;
    let (a, _) = register(&app, "ana").await;
    let (b, bid) = register(&app, "bob").await;
    let (sid, _, _) = make_server(&app, &a).await;

    let (st, _) = call(&app, "POST", "/invites/inexistente/join", Some(&b), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (_, inv) = call(&app, "POST", &format!("/servers/{sid}/invites"), Some(&a), None).await;
    let code = inv["code"].as_str().unwrap().to_string();
    let (st, _) = call(&app, "POST", &format!("/invites/{code}/join"), Some(&b), None).await;
    assert_eq!(st, StatusCode::OK);

    // Membro comum não administra.
    let (st, _) = call(&app, "POST", &format!("/servers/{sid}/channels"), Some(&b), Some(json!({"name": "x", "kind": "text"}))).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, _) = call(&app, "DELETE", &format!("/servers/{sid}"), Some(&b), None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    // Dono promove e o admin passa a criar canais.
    let (st, _) = call(&app, "PATCH", &format!("/servers/{sid}/members/{bid}"), Some(&a), Some(json!({"role": "admin"}))).await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = call(&app, "POST", &format!("/servers/{sid}/channels"), Some(&b), Some(json!({"name": "dev", "kind": "text"}))).await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = call(&app, "POST", &format!("/servers/{sid}/channels"), Some(&b), Some(json!({"name": "dev", "kind": "video"}))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Convite revogado não funciona.
    let (_, inv2) = call(&app, "POST", &format!("/servers/{sid}/invites"), Some(&a), None).await;
    let c2 = inv2["code"].as_str().unwrap().to_string();
    call(&app, "DELETE", &format!("/servers/{sid}/invites/{c2}"), Some(&a), None).await;
    let (c, _) = register(&app, "cris").await;
    let (st, _) = call(&app, "POST", &format!("/invites/{c2}/join"), Some(&c), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // Admin não expulsa o dono.
    let (_, me) = call(&app, "GET", "/me", Some(&a), None).await;
    let aid = me["id"].as_str().unwrap();
    let (st, _) = call(&app, "DELETE", &format!("/servers/{sid}/members/{aid}"), Some(&b), None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    // Sair do servidor remove o acesso.
    call(&app, "POST", &format!("/servers/{sid}/leave"), Some(&b), None).await;
    let (st, _) = call(&app, "GET", &format!("/servers/{sid}"), Some(&b), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn messages_crud_pagination_dedupe_reactions() {
    let app = app().await;
    let (a, _) = register(&app, "ana").await;
    let (b, _) = register(&app, "bob").await;
    let (sid, text, voice) = make_server(&app, &a).await;
    let (_, inv) = call(&app, "POST", &format!("/servers/{sid}/invites"), Some(&a), None).await;
    call(&app, "POST", &format!("/invites/{}/join", inv["code"].as_str().unwrap()), Some(&b), None).await;

    let url = format!("/channels/{text}/messages");
    let (st, _) = call(&app, "POST", &url, Some(&a), Some(json!({"content": "   "}))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = call(&app, "POST", &format!("/channels/{voice}/messages"), Some(&a), Some(json!({"content": "oi"}))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "voz não recebe mensagens");

    // Reenvio com o mesmo nonce não duplica.
    let (_, m1) = call(&app, "POST", &url, Some(&a), Some(json!({"content": "primeira", "client_nonce": "n1"}))).await;
    let (_, m1b) = call(&app, "POST", &url, Some(&a), Some(json!({"content": "primeira", "client_nonce": "n1"}))).await;
    assert_eq!(m1["id"], m1b["id"]);

    for i in 0..6 {
        let (st, _) = call(&app, "POST", &url, Some(&b), Some(json!({"content": format!("msg {i}")}))).await;
        assert_eq!(st, StatusCode::OK);
    }
    // 7 mensagens no total; páginas de 3 sem repetir nem perder.
    let mut seen = vec![];
    let mut cursor: Option<String> = None;
    loop {
        let q = match &cursor { Some(c) => format!("{url}?limit=3&before={c}"), None => format!("{url}?limit=3") };
        let (st, v) = call(&app, "GET", &q, Some(&a), None).await;
        assert_eq!(st, StatusCode::OK);
        for m in v["messages"].as_array().unwrap() {
            seen.push(m["id"].as_str().unwrap().to_string());
        }
        match v["next_cursor"].as_str() { Some(c) => cursor = Some(c.into()), None => break }
    }
    assert_eq!(seen.len(), 7);
    let mut uniq = seen.clone();
    uniq.sort();
    uniq.dedup();
    assert_eq!(uniq.len(), 7, "sem duplicatas entre páginas");

    // Edição e exclusão: só o autor edita; autor ou admin excluem.
    let mid = m1["id"].as_str().unwrap();
    let (st, _) = call(&app, "PATCH", &format!("/messages/{mid}"), Some(&b), Some(json!({"content": "hack"}))).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, v) = call(&app, "PATCH", &format!("/messages/{mid}"), Some(&a), Some(json!({"content": "editada"}))).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(v["content"], "editada");
    assert!(v["edited_at"].is_number());
    let (st, _) = call(&app, "DELETE", &format!("/messages/{mid}"), Some(&b), None).await;
    assert_eq!(st, StatusCode::FORBIDDEN, "membro comum não apaga mensagem alheia");

    // Reações.
    let (st, _) = call(&app, "PUT", &format!("/messages/{mid}/reactions/%F0%9F%91%8D"), Some(&b), None).await;
    assert_eq!(st, StatusCode::OK);
    let (_, v) = call(&app, "GET", &format!("{url}?limit=100"), Some(&a), None).await;
    let first = v["messages"].as_array().unwrap().iter().find(|m| m["id"] == mid).unwrap();
    assert_eq!(first["reactions"][0]["count"], 1);
    call(&app, "DELETE", &format!("/messages/{mid}/reactions/%F0%9F%91%8D"), Some(&b), None).await;

    let (st, _) = call(&app, "DELETE", &format!("/messages/{mid}"), Some(&a), None).await;
    assert_eq!(st, StatusCode::OK);
    let (_, v) = call(&app, "GET", &format!("{url}?limit=100"), Some(&a), None).await;
    let gone = v["messages"].as_array().unwrap().iter().find(|m| m["id"] == mid).unwrap();
    assert_eq!(gone["deleted"], true);
    assert_eq!(gone["content"], "");

    // Markdown é guardado como veio (sem HTML gerado).
    let raw = "# oi\n```python\nprint(1)\n```\n<script>alert(1)</script>";
    let (_, v) = call(&app, "POST", &url, Some(&a), Some(json!({"content": raw}))).await;
    assert_eq!(v["content"], raw);
}

#[tokio::test]
async fn voice_token_is_scoped_jwt() {
    let app = app().await;
    let (a, _) = register(&app, "ana").await;
    let (_, text, voice) = make_server(&app, &a).await;
    let (st, _) = call(&app, "POST", &format!("/channels/{text}/voice-token"), Some(&a), None).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, v) = call(&app, "POST", &format!("/channels/{voice}/voice-token"), Some(&a), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(v["room"], format!("squak-{voice}"));
    let jwt = v["token"].as_str().unwrap();
    assert_eq!(jwt.split('.').count(), 3);
    assert!(!v.to_string().contains("segredo-de-teste"), "o segredo nunca vai ao cliente");

    // Token da tela: exige estar na sala (presença de voz) e só vale para quem é membro.
    let (st, _) = call(&app, "POST", &format!("/channels/{voice}/share-token"), Some(&a), None).await;
    assert_eq!(st, StatusCode::FORBIDDEN, "quem não entrou na sala não transmite");
    let (b, _) = register(&app, "bob").await;
    let (st, _) = call(&app, "POST", &format!("/channels/{voice}/share-token"), Some(&b), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND, "não-membro não obtém token");
}
