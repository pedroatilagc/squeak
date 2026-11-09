import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiFailure } from '../../api';
import { Icon } from '../../design/Icon';
import type { DeviceFlow } from '../../domain/github';
import { githubApi } from '../../infra/githubApi';
import { openUrl } from '../../native';

type Phase =
  | { k: 'idle' } | { k: 'starting' }
  | { k: 'waiting'; flow: DeviceFlow; interval: number }
  | { k: 'done' } | { k: 'failed'; reason: 'denied' | 'expired' | 'error'; message?: string };

/**
 * Conexão por Device Flow da GitHub App: o app mostra um código, o usuário o digita em github.com/login/device
 * e a API (não o app) troca o código pelo token. Nenhum token chega a este componente.
 */
export function ConnectGithub({ reauth, onConnected }: { reauth?: boolean; onConnected: () => void }) {
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { alive.current = true; return () => { alive.current = false; window.clearTimeout(timer.current); }; }, []);

  const poll = useCallback((flow: DeviceFlow, interval: number) => {
    timer.current = window.setTimeout(async () => {
      try {
        const r = await githubApi.pollDevice(flow.flow_id);
        if (!alive.current) return;
        if (r.status === 'connected') { setPhase({ k: 'done' }); onConnected(); return; }
        if (r.status === 'denied' || r.status === 'expired') { setPhase({ k: 'failed', reason: r.status }); return; }
        const next = r.interval ?? (r.status === 'slow_down' ? interval + 5 : interval);
        setPhase({ k: 'waiting', flow, interval: next });
        poll(flow, next);
      } catch (e) {
        if (alive.current) setPhase({ k: 'failed', reason: 'error', message: e instanceof ApiFailure ? e.message : 'Falha inesperada' });
      }
    }, interval * 1000);
  }, [onConnected]);

  const start = async () => {
    setPhase({ k: 'starting' });
    try {
      const flow = await githubApi.startDevice();
      if (!alive.current) return;
      setPhase({ k: 'waiting', flow, interval: flow.interval });
      poll(flow, flow.interval);
    } catch (e) {
      setPhase({ k: 'failed', reason: 'error', message: e instanceof ApiFailure ? e.message : 'Falha inesperada' });
    }
  };
  const cancel = () => { window.clearTimeout(timer.current); setPhase({ k: 'idle' }); };

  if (phase.k === 'done') return <div className="callout ok"><Icon name="check-circle" /> GitHub conectado.</div>;

  if (phase.k === 'waiting') {
    const { flow } = phase;
    return (
      <div className="device">
        <p className="muted">Abra o GitHub e digite este código para autorizar o Squak:</p>
        <div className="device-code" aria-live="polite">{flow.user_code}</div>
        <div className="row start">
          <button className="primary" onClick={() => void openUrl(flow.verification_uri)}><Icon name="external" /> Abrir {new URL(flow.verification_uri).host}</button>
          <button onClick={() => navigator.clipboard.writeText(flow.user_code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}>
            <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copiado' : 'Copiar código'}</button>
          <button className="ghost" onClick={cancel}>Cancelar</button>
        </div>
        <p className="dim small"><Icon name="refresh" size={12} className="spin" /> Aguardando a autorização… O código vale por {Math.round(flow.expires_in / 60)} minutos.</p>
      </div>
    );
  }

  return (
    <div className="device">
      {phase.k === 'failed' && (
        <div className="callout bad" role="alert"><Icon name="alert" />
          {phase.reason === 'denied' ? 'Você negou a autorização no GitHub.' : phase.reason === 'expired' ? 'O código expirou antes da autorização.' : phase.message ?? 'Não foi possível conectar.'}
        </div>
      )}
      <button className="primary" onClick={start} disabled={phase.k === 'starting'}>
        <Icon name={reauth ? 'refresh' : 'plug'} /> {phase.k === 'starting' ? 'Gerando código…' : reauth ? 'Reconectar GitHub' : 'Conectar GitHub'}
      </button>
    </div>
  );
}
