// Ponte com o Rust. No navegador (desenvolvimento) cai para localStorage.
const inTauri = '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export async function saveSession(value: string) {
  if (inTauri) await invoke('save_session', { value });
  else localStorage.setItem('squak.session', value);
}
export async function loadSession(): Promise<string | null> {
  if (inTauri) return (await invoke<string | null>('load_session')) ?? null;
  return localStorage.getItem('squak.session');
}
export async function clearSession() {
  if (inTauri) await invoke('clear_session');
  else localStorage.removeItem('squak.session');
}
export async function openUrl(url: string) {
  if (inTauri) await invoke('open_url', { url });
  else window.open(url, '_blank', 'noopener,noreferrer');
}
