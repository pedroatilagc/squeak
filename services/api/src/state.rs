use crate::{
    config::Config,
    github::{
        client::{http::HttpGitHub, mock::MockGitHub, GitHubApi},
        crypto::TokenCipher,
    },
    realtime::Hub,
};
use sqlx::SqlitePool;
use std::{collections::HashMap, sync::{Arc, Mutex}};

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub cfg: Arc<Config>,
    pub hub: Hub,
    /// Tentativas de login falhas: chave -> (contagem, início da janela em ms).
    pub login_attempts: Arc<Mutex<HashMap<String, (u32, i64)>>>,
    pub github: Arc<dyn GitHubApi>,
    /// `None` quando GITHUB_TOKEN_KEY falta ou é inválida (e não é mock).
    pub cipher: Option<Arc<TokenCipher>>,
    /// Refresh tokens são de uso único: serializa renovações concorrentes.
    pub github_refresh: Arc<tokio::sync::Mutex<()>>,
}

impl AppState {
    /// Mock quando `cfg.github.mock`; senão o cliente HTTP real.
    pub fn new(db: SqlitePool, cfg: Config) -> Self {
        let gh: Arc<dyn GitHubApi> = if cfg.github.mock {
            Arc::new(MockGitHub::new())
        } else {
            Arc::new(HttpGitHub::new(&cfg.github))
        };
        Self::with_github(db, cfg, gh)
    }

    /// Permite injetar outro cliente GitHub (testes).
    pub fn with_github(db: SqlitePool, cfg: Config, github: Arc<dyn GitHubApi>) -> Self {
        let cipher = match TokenCipher::from_base64_key(&cfg.github.token_key) {
            Ok(c) => Some(Arc::new(c)),
            // Mock sem chave: chave fixa de desenvolvimento (os tokens do mock são falsos).
            Err(_) if github.is_mock() => Some(Arc::new(TokenCipher::dev_key())),
            Err(_) => {
                if !cfg.github.token_key.is_empty() {
                    tracing::warn!("GITHUB_TOKEN_KEY inválida (precisa ser 32 bytes em base64); integração GitHub desativada");
                }
                None
            }
        };
        Self {
            db,
            cfg: Arc::new(cfg),
            hub: Hub::new(),
            login_attempts: Default::default(),
            github,
            cipher,
            github_refresh: Default::default(),
        }
    }
}

pub async fn connect(url: &str) -> Result<SqlitePool, sqlx::Error> {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;
    let opts = SqliteConnectOptions::from_str(url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
    // Em memória cada conexão teria seu próprio banco: força 1 conexão.
    let max = if url.contains(":memory:") { 1 } else { 5 };
    let pool = SqlitePoolOptions::new().max_connections(max).connect_with(opts).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
