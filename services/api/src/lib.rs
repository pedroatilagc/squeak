//! Squak API: Axum + SQLite. Domínio simples (users, servers, channels, messages), tempo real por WebSocket
//! e emissão de tokens LiveKit para voz.
pub mod auth;
pub mod config;
pub mod error;
pub mod github;
pub mod integrations;
pub mod messages;
pub mod realtime;
pub mod servers;
pub mod state;
pub mod voice;

use axum::{
    routing::{delete, get, patch, post, put},
    Router,
};
use state::AppState;

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/me", get(auth::me).patch(auth::update_me))
        .route("/servers", get(servers::list).post(servers::create))
        .route("/servers/{id}", get(servers::detail).delete(servers::remove))
        .route("/servers/{id}/leave", post(servers::leave))
        .route("/servers/{id}/invites", post(servers::create_invite))
        .route("/servers/{id}/invites/{code}", delete(servers::revoke_invite))
        .route("/servers/{id}/categories", post(servers::create_category))
        .route("/servers/{id}/channels", post(servers::create_channel))
        .route("/servers/{id}/members/{user_id}", patch(servers::set_role).delete(servers::kick))
        .route("/invites/{code}/join", post(servers::join))
        .route("/channels/{id}", patch(servers::rename_channel).delete(servers::delete_channel))
        .route("/channels/{id}/messages", get(messages::list).post(messages::send))
        .route("/messages/{id}", patch(messages::edit).delete(messages::remove))
        .route("/messages/{id}/reactions/{emoji}", put(messages::react).delete(messages::unreact))
        .route("/channels/{id}/voice-token", post(voice::token))
        .route("/channels/{id}/share-token", post(voice::share_token))
        .route("/ws", get(realtime::ws_handler))
        .route("/integrations", get(integrations::list))
        .route("/integrations/github", delete(github::authentication::disconnect))
        .route("/integrations/github/device", post(github::authentication::device_start))
        .route("/integrations/github/device/poll", post(github::authentication::device_poll))
        .route("/github/profile", get(github::profile::get))
        .route("/github/contributions", get(github::contributions::get))
        .route("/github/activity", get(github::events::get))
        .route("/github/pull-requests", get(github::pull_requests::mine))
        .route("/github/installations", get(github::repositories::installations))
        .route("/github/installations/{id}/repositories", get(github::repositories::installation_repos))
        .route("/servers/{id}/github", get(github::repositories::server_links))
        .route("/servers/{id}/github/repos", put(github::repositories::put_repos))
        .route("/servers/{id}/github/repos/{link_id}", delete(github::repositories::delete_link))
        .route("/servers/{id}/activity", get(github::developer_activity::feed))
        .route("/servers/{id}/pull-requests", get(github::pull_requests::server))
        // Corpo bruto (Bytes) para validar a assinatura; limite próprio porque o endpoint é público.
        .route(
            "/webhooks/github",
            post(github::webhooks::receive).layer(axum::extract::DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        // Autenticação é por Bearer (sem cookies), então liberar origens não expõe sessões de terceiros.
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        )
        .with_state(state)
}
