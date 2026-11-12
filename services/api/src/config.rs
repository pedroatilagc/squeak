use std::fmt;

#[derive(Clone, Debug, Default)]
pub struct Config {
    pub bind: String,
    pub database_url: String,
    pub livekit_url: String,
    pub livekit_key: String,
    pub livekit_secret: String,
    pub github: GitHubConfig,
}

impl Config {
    pub fn from_env() -> Self {
        let get = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_string());
        Self {
            bind: get("API_BIND", "127.0.0.1:8080"),
            database_url: get("DATABASE_URL", "sqlite://data/squak.db?mode=rwc"),
            livekit_url: get("LIVEKIT_URL", "ws://localhost:7880"),
            livekit_key: get("LIVEKIT_API_KEY", ""),
            livekit_secret: get("LIVEKIT_API_SECRET", ""),
            github: GitHubConfig::from_env(),
        }
    }
}

/// Configuração da GitHub App. Segredos ficam só no ambiente do servidor.
#[derive(Clone)]
pub struct GitHubConfig {
    pub client_id: String,
    pub client_secret: String,
    pub app_slug: String,
    pub webhook_secret: String,
    /// 32 bytes em base64.
    pub token_key: String,
    pub api_base: String,
    pub mock: bool,
}

impl Default for GitHubConfig {
    fn default() -> Self {
        Self {
            client_id: String::new(),
            client_secret: String::new(),
            app_slug: String::new(),
            webhook_secret: String::new(),
            token_key: String::new(),
            api_base: "https://api.github.com".into(),
            mock: false,
        }
    }
}

impl GitHubConfig {
    pub fn from_env() -> Self {
        let get = |k: &str| std::env::var(k).unwrap_or_default().trim().to_string();
        let api = get("GITHUB_API_BASE");
        Self {
            client_id: get("GITHUB_APP_CLIENT_ID"),
            client_secret: get("GITHUB_APP_CLIENT_SECRET"),
            app_slug: get("GITHUB_APP_SLUG"),
            webhook_secret: get("GITHUB_WEBHOOK_SECRET"),
            token_key: get("GITHUB_TOKEN_KEY"),
            // Tokens e client_secret viajam nesta base: fora de localhost, só https.
            api_base: if api.is_empty() || !(api.starts_with("https://") || api.starts_with("http://127.0.0.1") || api.starts_with("http://localhost")) { Self::default().api_base } else { api.trim_end_matches('/').to_string() },
            mock: get("GITHUB_MOCK") == "1",
        }
    }
}

// Debug manual: nunca imprime segredos (Config derivaria Debug e vazaria em logs).
impl fmt::Debug for GitHubConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let set = |s: &str| if s.is_empty() { "<vazio>" } else { "<definido>" };
        f.debug_struct("GitHubConfig")
            .field("client_id", &set(&self.client_id))
            .field("client_secret", &set(&self.client_secret))
            .field("app_slug", &self.app_slug)
            .field("webhook_secret", &set(&self.webhook_secret))
            .field("token_key", &set(&self.token_key))
            .field("api_base", &self.api_base)
            .field("mock", &self.mock)
            .finish()
    }
}
