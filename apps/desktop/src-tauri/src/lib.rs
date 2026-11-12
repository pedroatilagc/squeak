//! Núcleo desktop do Squak. A sessão fica no Gerenciador de Credenciais do Windows (nunca em texto puro).
//! O compartilhamento de tela (captura WGC, H.264 do Windows, áudio WASAPI) veio do PartilharTela: ver
//! docs/SCREEN_SHARE_INTEGRATION.md.

mod media;
mod share;
mod sources;

use tauri::RunEvent;

const SERVICE: &str = "squak";
const ACCOUNT: &str = "session";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_session(value: String) -> Result<(), String> {
    entry()?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_session() -> Option<String> {
    entry().ok()?.get_password().ok()
}

#[tauri::command]
fn clear_session() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Abre só links http(s) no navegador padrão.
#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("protocolo não permitido".into());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(share::ShareState::default())
        .invoke_handler(tauri::generate_handler![
            save_session,
            load_session,
            clear_session,
            open_url,
            share::start_share,
            share::stop_share,
            share::set_share_audio_muted,
            sources::list_sources,
            sources::list_audio_processes
        ])
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o Squak");

    app.run(|handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            share::shutdown(handle);
        }
    });
}
