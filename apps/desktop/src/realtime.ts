import { WS_URL } from './api';

export type RtEvent = { type: string; [k: string]: any };
type Listener = (e: RtEvent) => void;

/** WebSocket autenticado com reconexão por backoff exponencial. `resync` é emitido após reconectar. */
export class Realtime {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closed = false;
  private timer: number | undefined;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: 'connecting' | 'online' | 'offline') => void>();
  private hadConnection = false;

  constructor(private token: string) {}

  on(l: Listener): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  onStatus(l: (s: 'connecting' | 'online' | 'offline') => void): () => void { this.statusListeners.add(l); return () => { this.statusListeners.delete(l); }; }
  private status(s: 'connecting' | 'online' | 'offline') { this.statusListeners.forEach((l) => l(s)); }

  connect() {
    this.closed = false;
    this.status('connecting');
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: this.token }));
    ws.onmessage = (m) => {
      let e: RtEvent;
      try { e = JSON.parse(m.data); } catch { return; }
      if (e.type === 'ready') {
        this.attempt = 0;
        this.status('online');
        if (this.hadConnection) this.listeners.forEach((l) => l({ type: 'resync' }));
        this.hadConnection = true;
        return;
      }
      this.listeners.forEach((l) => l(e));
    };
    ws.onclose = () => {
      this.status('offline');
      if (this.closed) return;
      const delay = Math.min(30000, 500 * 2 ** this.attempt++) + Math.random() * 300;
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  send(obj: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.closed = true;
    window.clearTimeout(this.timer);
    this.ws?.close();
  }
}
