import type { Room } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiFailure } from '../api';

// No app Tauri a tela é capturada e codificada pelo Rust (Windows Graphics Capture + H.264 + WASAPI).
// No navegador (desenvolvimento) cai para getDisplayMedia pelo próprio livekit-client.
const inTauri = '__TAURI_INTERNALS__' in window;

type Source = { id: string; kind: 'screen' | 'window'; title: string; thumbnail?: string; pid?: number | null; minimized?: boolean };
type AudioProcess = { pid: number; name: string };
type AudioMode = 'none' | 'system' | 'application' | 'system-excluding';

const QUALITIES = {
  '720p30': { label: '720p 30fps', width: 1280, height: 720, fps: 30, bitrate: 4_000_000 },
  '1080p30': { label: '1080p 30fps', width: 1920, height: 1080, fps: 30, bitrate: 8_000_000 },
  '1080p60': { label: '1080p 60fps', width: 1920, height: 1080, fps: 60, bitrate: 12_000_000 },
} as const;
type QKey = keyof typeof QUALITIES;

const errText = (e: unknown) => (typeof e === 'string' ? e : e instanceof ApiFailure || e instanceof Error ? e.message : 'Não foi possível transmitir a tela.');

export function ShareControl({ room, channelId, disabled, onSharing, onError }: {
  room: Room | null; channelId: string; disabled: boolean; onSharing: (on: boolean) => void; onError: (m: string) => void;
}) {
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [picker, setPicker] = useState<{ sources: Source[]; loading: boolean } | null>(null);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [quality, setQuality] = useState<QKey>('1080p30');
  const [motion, setMotion] = useState(true);
  const [audio, setAudio] = useState<AudioMode>('system');
  const [procs, setProcs] = useState<AudioProcess[]>([]);
  const [pid, setPid] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState('');
  const busy = useRef(false);

  const set = (v: boolean) => { setLive(v); onSharing(v); };

  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) => listen<{ state: string; message?: string }>('share:state', ({ payload }) => {
      if (payload.state === 'starting') setStarting(true);
      else if (payload.state === 'live') { setStarting(false); set(true); }
      else { setStarting(false); set(false); setMuted(false); if (payload.state === 'error' && payload.message) onError(payload.message); }
    })).then((u) => { off = u; });
    return () => { off?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sair da sala encerra a transmissão.
  useEffect(() => () => { if (inTauri) void import('@tauri-apps/api/core').then(({ invoke }) => invoke('stop_share').catch(() => {})); }, []);

  const invoke = async <T,>(cmd: string, args?: Record<string, unknown>) => (await import('@tauri-apps/api/core')).invoke<T>(cmd, args);

  const loadProcs = async () => { try { setProcs(await invoke<AudioProcess[]>('list_audio_processes')); } catch { /* sem lista */ } };
  const openPicker = async () => {
    setErr(''); setPicker({ sources: [], loading: true });
    try { setPicker({ sources: await invoke<Source[]>('list_sources'), loading: false }); } catch (e) { setPicker(null); onError(errText(e)); }
  };

  const startNative = async (src: Source) => {
    if (busy.current) return;
    const p = pid ?? (audio === 'application' ? src.pid ?? null : null);
    if ((audio === 'application' || audio === 'system-excluding') && p === null) { setErr('Escolha o aplicativo do som antes de transmitir.'); return; }
    busy.current = true; setErr('');
    try {
      const q = QUALITIES[quality];
      const grant = await api<{ url: string; token: string }>('POST', `/channels/${channelId}/share-token`);
      // "Texto e código": menos quadros por segundo com o mesmo bitrate, cada quadro mais nítido.
      await invoke('start_share', { url: grant.url, token: grant.token, quality: { width: q.width, height: q.height, fps: motion ? q.fps : Math.min(q.fps, 15), bitrate: q.bitrate }, audio, audioPid: p, source: src.id });
      setPicker(null); setMuted(false);
    } catch (e) { setErr(errText(e)); }
    finally { busy.current = false; }
  };

  const toggleBrowser = async () => {
    const lp = room?.localParticipant; if (!lp) return;
    try {
      await lp.setScreenShareEnabled(!lp.isScreenShareEnabled, { audio: true, resolution: { width: 1920, height: 1080, frameRate: 30 } });
      set(lp.isScreenShareEnabled);
    } catch (e) { const n = (e as Error)?.name; if (n !== 'NotAllowedError' && n !== 'AbortError') onError('Não foi possível compartilhar a tela neste ambiente.'); }
  };

  const click = () => {
    if (!inTauri) return void toggleBrowser();
    if (live) return void invoke('stop_share').catch((e) => onError(errText(e)));
    void openPicker();
  };

  const filtered = picker?.sources.filter((s) => s.kind === tab) ?? [];
  return (
    <>
      <button className={live ? 'on' : ''} onClick={click} disabled={disabled || starting} title={live ? 'Parar de compartilhar' : 'Compartilhar tela'}>{starting ? '…' : '🖥'}</button>
      {live && inTauri && <button className={muted ? 'off' : ''} title={muted ? 'Ativar som da tela' : 'Mutar som da tela'}
        onClick={() => invoke('set_share_audio_muted', { muted: !muted }).then(() => setMuted(!muted)).catch((e) => onError(errText(e)))}>{muted ? '🔕' : '🔔'}</button>}
      {/* Portal: o modal não pode herdar o CSS dos botões redondos da barra de controles onde este componente vive. */}
      {picker && createPortal(
        <div className="modal-back" onMouseDown={() => !starting && setPicker(null)}>
          <div className="modal share-modal" role="dialog" aria-label="Compartilhar tela" onMouseDown={(e) => e.stopPropagation()}>
            <h2>O que você quer transmitir?</h2>
            <div className="share-opts">
              <label>Som
                <select value={audio} onChange={(e) => { const m = e.target.value as AudioMode; setAudio(m); if (m === 'application' || m === 'system-excluding') void loadProcs(); }}>
                  <option value="none">Sem som</option><option value="system">Som do sistema</option>
                  <option value="application">Som de um aplicativo</option><option value="system-excluding">Sistema, menos um aplicativo</option>
                </select></label>
              {(audio === 'application' || audio === 'system-excluding') && (
                <label>Aplicativo
                  <select value={pid ?? ''} onChange={(e) => setPid(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{audio === 'application' ? 'Dono da janela escolhida' : 'Escolha o aplicativo'}</option>
                    {procs.map((p) => <option key={p.pid} value={p.pid}>{p.name}</option>)}
                  </select></label>
              )}
              <label>Qualidade
                <select value={quality} onChange={(e) => setQuality(e.target.value as QKey)}>{(Object.keys(QUALITIES) as QKey[]).map((k) => <option key={k} value={k}>{QUALITIES[k].label}</option>)}</select></label>
              <label>Modo
                <select value={motion ? 'motion' : 'detail'} onChange={(e) => setMotion(e.target.value === 'motion')}>
                  <option value="motion">Movimento e jogos</option><option value="detail">Texto e código</option></select></label>
            </div>
            <div className="seg">
              <button className={tab === 'screen' ? 'on' : ''} onClick={() => setTab('screen')}>Telas</button>
              <button className={tab === 'window' ? 'on' : ''} onClick={() => setTab('window')}>Janelas</button>
              <span className="grow" /><button onClick={() => void openPicker()} disabled={picker.loading || starting}>Atualizar lista</button>
            </div>
            <div className="sources">
              {picker.loading ? <p className="muted">Procurando telas e janelas…</p>
                : filtered.length === 0 ? <p className="muted">Nenhuma {tab === 'screen' ? 'tela' : 'janela'} encontrada.</p>
                : filtered.map((s) => (
                  <button key={s.id} className="source" disabled={starting} onClick={() => void startNative(s)}>
                    {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <span className="source-blank" />}
                    <span>{s.title}{s.minimized && <small className="muted"> · minimizada</small>}</span>
                  </button>))}
            </div>
            {err && <div className="error">{err}</div>}
            {starting && <p className="muted">Iniciando a transmissão…</p>}
            <div className="row"><button onClick={() => setPicker(null)} disabled={starting}>Cancelar</button></div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
