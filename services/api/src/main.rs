use squak_api::{config::Config, router, state::{connect, AppState}};

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    let _ = dotenvy::from_path("../../.env");
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    let cfg = Config::from_env();
    if cfg.database_url.starts_with("sqlite://data/") {
        let _ = std::fs::create_dir_all("data");
    }
    let db = connect(&cfg.database_url).await.expect("falha ao abrir o SQLite");
    let bind = cfg.bind.clone();
    let app = router(AppState::new(db, cfg));
    let listener = tokio::net::TcpListener::bind(&bind).await.expect("porta ocupada");
    tracing::info!("Squak API em http://{bind}");
    axum::serve(listener, app).await.unwrap();
}
