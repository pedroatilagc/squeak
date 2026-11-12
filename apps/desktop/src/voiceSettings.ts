import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';

export type Profile = 'isolation' | 'studio' | 'custom';
export type SoundKey = 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'join' | 'leave';

export interface VoiceSettings {
  inputId: string; outputId: string;
  micVolume: number;      // 0..2 (ganho)
  speakerVolume: number;  // 0..1
  profile: Profile;
  autoSensitivity: boolean;
  threshold: number;      // 0..100 (sensibilidade manual)
  noiseSuppression: boolean; echoCancellation: boolean; autoGain: boolean;
  sounds: Record<SoundKey, boolean>;
  soundVolume: number;    // 0..1
}

export const SOUND_LABELS: Record<SoundKey, string> = {
  mute: 'Silenciar', unmute: 'Dessilenciar', deafen: 'Desativar áudio', undeafen: 'Reativar áudio', join: 'Entrar na sala', leave: 'Sair da sala',
};

export const DEFAULTS: VoiceSettings = {
  inputId: '', outputId: '', micVolume: 1, speakerVolume: 1, profile: 'isolation', autoSensitivity: true, threshold: 20,
  noiseSuppression: true, echoCancellation: true, autoGain: true,
  sounds: { mute: true, unmute: true, deafen: true, undeafen: true, join: true, leave: true }, soundVolume: 0.5,
};

const KEY = 'squak.voice';
const listeners = new Set<() => void>();
let current: VoiceSettings = load();

function load(): VoiceSettings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}'), sounds: { ...DEFAULTS.sounds, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}').sounds ?? {}) } }; } catch { return { ...DEFAULTS }; }
}
export const getVoiceSettings = () => current;
export function updateVoiceSettings(patch: Partial<VoiceSettings>) {
  let next = { ...current, ...patch };
  // Perfis prontos ajustam o processamento; qualquer ajuste manual vira "personalizado".
  if (patch.profile === 'isolation') next = { ...next, noiseSuppression: true, echoCancellation: true, autoGain: true, autoSensitivity: true };
  if (patch.profile === 'studio') next = { ...next, noiseSuppression: false, echoCancellation: false, autoGain: false, autoSensitivity: false, threshold: 0 };
  if (!patch.profile && ('noiseSuppression' in patch || 'echoCancellation' in patch || 'autoGain' in patch || 'autoSensitivity' in patch || 'threshold' in patch)) next.profile = 'custom';
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* sem armazenamento */ }
  listeners.forEach((l) => l());
}
export function subscribeVoiceSettings(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

export const captureConstraints = (s: VoiceSettings): MediaTrackConstraints => ({
  deviceId: s.inputId ? { exact: s.inputId } : undefined,
  echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGain,
});

// ---------- Sons de interface (sintetizados, sem arquivos) ----------
let sfx: AudioContext | null = null;
const TONES: Record<SoundKey, number[]> = { mute: [440, 330], unmute: [330, 440], deafen: [392, 262], undeafen: [262, 392], join: [330, 494, 660], leave: [494, 330, 220] };
export function playSound(kind: SoundKey) {
  const s = getVoiceSettings();
  if (!s.sounds[kind] || s.soundVolume <= 0) return;
  try {
    sfx ??= new AudioContext();
    const t0 = sfx.currentTime;
    TONES[kind].forEach((f, i) => {
      const o = sfx!.createOscillator(); const g = sfx!.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + i * 0.09); g.gain.linearRampToValueAtTime(0.25 * s.soundVolume, t0 + i * 0.09 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.09 + 0.12);
      o.connect(g).connect(sfx!.destination); o.start(t0 + i * 0.09); o.stop(t0 + i * 0.09 + 0.14);
    });
  } catch { /* áudio indisponível */ }
}

// ---------- Ganho do microfone + porta de ruído (sensibilidade) ----------
export function rms(buf: Float32Array): number {
  let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
/** Limite de abertura da porta. No modo automático acompanha o piso de ruído medido. */
export function gateThreshold(s: VoiceSettings, floor: number): number {
  return s.autoSensitivity ? Math.max(0.008, floor * 3) : (s.threshold / 100) * 0.1;
}

export class MicProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'squak-mic';
  processedTrack?: MediaStreamTrack;
  private nodes: AudioNode[] = [];
  private timer?: number;
  constructor(private settings: () => VoiceSettings) {}

  async init(opts: AudioProcessorOptions) {
    const ctx = opts.audioContext;
    const src = ctx.createMediaStreamSource(new MediaStream([opts.track]));
    const gain = ctx.createGain(); const gate = ctx.createGain(); const an = ctx.createAnalyser(); an.fftSize = 1024;
    const dest = ctx.createMediaStreamDestination();
    src.connect(an); src.connect(gain); gain.connect(gate); gate.connect(dest);
    this.nodes = [src, gain, gate, an, dest];
    const buf = new Float32Array(an.fftSize);
    let floor = 0.01; let openUntil = 0;
    this.timer = window.setInterval(() => {
      const s = this.settings();
      an.getFloatTimeDomainData(buf);
      const level = rms(buf);
      floor = level < floor ? level : floor + (level - floor) * 0.002;
      if (level > gateThreshold(s, floor)) openUntil = performance.now() + 250;
      gain.gain.value = s.micVolume;
      gate.gain.setTargetAtTime(s.profile === 'studio' || performance.now() < openUntil ? 1 : 0, ctx.currentTime, 0.015);
    }, 20);
    this.processedTrack = dest.stream.getAudioTracks()[0];
  }
  async restart(opts: AudioProcessorOptions) { await this.destroy(); await this.init(opts); }
  async destroy() { window.clearInterval(this.timer); this.nodes.forEach((n) => n.disconnect()); this.nodes = []; }
}
