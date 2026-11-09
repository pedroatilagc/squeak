import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, type User } from '../api';
import { gateThreshold, getVoiceSettings, playSound, rms, SOUND_LABELS, subscribeVoiceSettings, updateVoiceSettings, captureConstraints, type Profile, type SoundKey } from '../voiceSettings';

type Tab = 'voz' | 'sons' | 'conta';
const PROFILES: [Profile, string, string][] = [
  ['isolation', 'Isolamento de voz', 'Só a sua voz: supressão de ruído, eco e ganho automáticos.'],
  ['studio', 'Estúdio', 'Áudio puro: microfone aberto e sem processamento.'],
  ['custom', 'Personalizado', 'Modo avançado: todos os botões e medidores.'],
];

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="set-row">
      <div><b>{label}</b>{hint && <small className="muted">{hint}</small>}</div>
      <button role="switch" aria-checked={on} className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}><i /></button>
    </div>
  );
}

export function Settings({ me, onClose, onMe }: { me: User; onClose: () => void; onMe: (u: User) => void }) {
  const s = useSyncExternalStore(subscribeVoiceSettings, getVoiceSettings);
  const [tab, setTab] = useState<Tab>('voz');
  const [devs, setDevs] = useState<{ ins: MediaDeviceInfo[]; outs: MediaDeviceInfo[] }>({ ins: [], outs: [] });
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [micErr, setMicErr] = useState('');
  const [status, setStatus] = useState(me.status_text ?? '');
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const sRef = useRef(s); sRef.current = s;

  const loadDevices = async () => {
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    setDevs({ ins: all.filter((d) => d.kind === 'audioinput'), outs: all.filter((d) => d.kind === 'audiooutput') });
  };
  useEffect(() => { void loadDevices(); }, []);

  const stopTest = () => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setTesting(false); setLevel(0); };
  useEffect(() => stopTest, []);

  // O microfone só é pedido quando o usuário clica em "Teste do microfone".
  const startTest = async () => {
    setMicErr('');
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: captureConstraints(sRef.current) });
      stream.current = st; setTesting(true); void loadDevices();
      const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(st).connect(an);
      const buf = new Float32Array(an.fftSize);
      const tick = () => { an.getFloatTimeDomainData(buf); setLevel(Math.min(1, rms(buf) * sRef.current.micVolume * 6)); raf.current = requestAnimationFrame(tick); };
      tick();
    } catch { setMicErr('Não foi possível acessar o microfone. Verifique a permissão e o dispositivo selecionado.'); }
  };
  useEffect(() => { if (testing) { stopTest(); void startTest(); } }, [s.inputId, s.noiseSuppression, s.echoCancellation, s.autoGain]); // eslint-disable-line react-hooks/exhaustive-deps

  const marker = Math.min(1, gateThreshold({ ...s, autoSensitivity: false }, 0) * 6);

  return (
    <div className="modal-back settings-back" onMouseDown={onClose}>
      <div className="settings" role="dialog" aria-label="Configurações" onMouseDown={(e) => e.stopPropagation()}>
        <nav>
          <h3>Configurações</h3>
          <button className={tab === 'voz' ? 'on' : ''} onClick={() => setTab('voz')}>🎙 Voz</button>
          <button className={tab === 'sons' ? 'on' : ''} onClick={() => setTab('sons')}>🔔 Sons</button>
          <button className={tab === 'conta' ? 'on' : ''} onClick={() => setTab('conta')}>👤 Minha conta</button>
        </nav>
        <div className="set-body">
          <button className="close" onClick={onClose} aria-label="Fechar">✕</button>

          {tab === 'voz' && (<>
            <h2>Voz</h2>
            <div className="set-grid">
              <label>Microfone
                <select value={s.inputId} onChange={(e) => updateVoiceSettings({ inputId: e.target.value })}>
                  <option value="">Padrão do Windows</option>
                  {devs.ins.filter((d) => d.deviceId !== 'default').map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microfone'}</option>)}
                </select></label>
              <label>Alto-falante
                <select value={s.outputId} onChange={(e) => updateVoiceSettings({ outputId: e.target.value })}>
                  <option value="">Padrão do Windows</option>
                  {devs.outs.filter((d) => d.deviceId !== 'default').map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Alto-falante'}</option>)}
                </select></label>
              <label>Volume do microfone — {Math.round(s.micVolume * 100)}%
                <input type="range" min={0} max={2} step={0.05} value={s.micVolume} onChange={(e) => updateVoiceSettings({ micVolume: Number(e.target.value) })} /></label>
              <label>Volume do alto-falante — {Math.round(s.speakerVolume * 100)}%
                <input type="range" min={0} max={1} step={0.05} value={s.speakerVolume} onChange={(e) => updateVoiceSettings({ speakerVolume: Number(e.target.value) })} /></label>
            </div>
            <div className="mic-test">
              <button className="primary" onClick={testing ? stopTest : startTest}>{testing ? 'Parar teste' : 'Teste do microfone'}</button>
              <div className="meter" aria-label="Nível do microfone">
                {Array.from({ length: 40 }, (_, i) => <span key={i} className={i / 40 < level ? 'lit' : ''} />)}
                {!s.autoSensitivity && <i className="mark" style={{ left: `${marker * 100}%` }} />}
              </div>
            </div>
            {micErr && <div className="error">{micErr}</div>}

            <h4>Perfil de entrada</h4>
            {PROFILES.map(([id, name, desc]) => (
              <label key={id} className="radio"><input type="radio" name="profile" checked={s.profile === id} onChange={() => updateVoiceSettings({ profile: id })} />
                <span><b>{name}</b><small className="muted">{desc}</small></span></label>
            ))}

            <Toggle on={s.autoSensitivity} onChange={(v) => updateVoiceSettings({ autoSensitivity: v })} label="Ajustar automaticamente a sensibilidade de entrada" hint="Acompanha o ruído de fundo para decidir quando você está falando." />
            {!s.autoSensitivity && (
              <label className="set-slider">Sensibilidade manual — {s.threshold}
                <input type="range" min={0} max={100} value={s.threshold} onChange={(e) => updateVoiceSettings({ threshold: Number(e.target.value) })} />
                <small className="muted">Sons abaixo da marca no medidor não são transmitidos.</small></label>
            )}
            <Toggle on={s.noiseSuppression} onChange={(v) => updateVoiceSettings({ noiseSuppression: v })} label="Supressão de ruído" hint="Filtro do navegador (WebRTC), não é o Krisp." />
            <Toggle on={s.echoCancellation} onChange={(v) => updateVoiceSettings({ echoCancellation: v })} label="Cancelamento de eco" />
            <Toggle on={s.autoGain} onChange={(v) => updateVoiceSettings({ autoGain: v })} label="Controle automático de ganho" />
            <p className="muted small">Mudanças de dispositivo, perfil e sensibilidade valem na hora, inclusive durante uma chamada.</p>
          </>)}

          {tab === 'sons' && (<>
            <h2>Sons</h2>
            <label className="set-slider">Volume dos sons — {Math.round(s.soundVolume * 100)}%
              <input type="range" min={0} max={1} step={0.05} value={s.soundVolume} onChange={(e) => updateVoiceSettings({ soundVolume: Number(e.target.value) })} /></label>
            {(Object.keys(SOUND_LABELS) as SoundKey[]).map((k) => (
              <div key={k} className="set-row">
                <div><b>{SOUND_LABELS[k]}</b><button className="link" onClick={() => playSound(k)}>Prévia do som</button></div>
                <button role="switch" aria-checked={s.sounds[k]} className={'switch' + (s.sounds[k] ? ' on' : '')} onClick={() => updateVoiceSettings({ sounds: { ...s.sounds, [k]: !s.sounds[k] } })}><i /></button>
              </div>
            ))}
          </>)}

          {tab === 'conta' && (<>
            <h2>Minha conta</h2>
            <p><b>{me.username}</b></p>
            <label>Status personalizado
              <input value={status} maxLength={128} onChange={(e) => setStatus(e.target.value)} /></label>
            <div className="row"><button className="primary" onClick={async () => onMe(await api<User>('PATCH', '/me', { status_text: status }))}>Salvar status</button></div>
          </>)}
        </div>
      </div>
    </div>
  );
}
