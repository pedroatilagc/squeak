//! Fronteira com o GitHub: trait `GitHubApi` (object-safe), implementação real (`http`) e simulada (`mock`).
pub mod http;
pub mod mock;

use super::domain::{ActivityData, ContributionCalendar, InstallRepo, Installation, Profile, PullRequestCard};
use async_trait::async_trait;

/// Erros do GitHub já classificados. Sem detalhes: o que importa foi logado onde o erro nasceu
/// (nunca com tokens) e o cliente só recebe o `code` correspondente.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GhError {
    /// 401 / "Bad credentials" / refresh token inválido.
    Unauthorized,
    RateLimited,
    NotFound,
    /// Rede, 5xx, `errors` do GraphQL, resposta inesperada.
    Upstream,
}

pub struct DeviceStart {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: i64,
    pub interval: i64,
}

pub struct TokenSet {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
    pub refresh_token_expires_in: Option<i64>,
}

pub enum DevicePoll {
    Pending,
    SlowDown { interval: Option<i64> },
    Denied,
    Expired,
    Connected(TokenSet),
}

pub struct Viewer {
    pub id: i64,
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PrRole {
    Authored,
    ReviewRequested,
}

#[async_trait]
pub trait GitHubApi: Send + Sync {
    /// Só o mock devolve `true`; as respostas dele carregam `"mock": true`.
    fn is_mock(&self) -> bool;
    async fn device_start(&self) -> Result<DeviceStart, GhError>;
    async fn device_poll(&self, device_code: &str) -> Result<DevicePoll, GhError>;
    async fn refresh(&self, refresh_token: &str) -> Result<TokenSet, GhError>;
    async fn revoke(&self, access_token: &str) -> Result<(), GhError>;
    async fn viewer(&self, token: &str) -> Result<Viewer, GhError>;
    async fn profile(&self, token: &str) -> Result<Profile, GhError>;
    /// `from`/`to` em ISO 8601 UTC (`...Z`), já validados (máx. 1 ano).
    async fn contributions(&self, token: &str, from: &str, to: &str) -> Result<ContributionCalendar, GhError>;
    async fn activity(&self, token: &str, from: &str, to: &str) -> Result<ActivityData, GhError>;
    async fn pull_requests(&self, token: &str, role: PrRole) -> Result<Vec<PullRequestCard>, GhError>;
    async fn installations(&self, token: &str) -> Result<Vec<Installation>, GhError>;
    async fn installation_repositories(&self, token: &str, installation_id: i64) -> Result<Vec<InstallRepo>, GhError>;
}
