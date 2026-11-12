import { useState, type FormEvent, type ReactNode } from 'react';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function TextPrompt({ title, label, action, kindChoice, onSubmit, onClose }: {
  title: string; label: string; action: string; kindChoice?: boolean; onClose: () => void;
  onSubmit: (value: string, kind: 'text' | 'voice') => Promise<void>;
}) {
  const [v, setV] = useState('');
  const [kind, setKind] = useState<'text' | 'voice'>('text');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await onSubmit(v.trim(), kind); onClose(); } catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={go}>
        {kindChoice && (
          <div className="seg">
            <button type="button" className={kind === 'text' ? 'on' : ''} onClick={() => setKind('text')}># Texto</button>
            <button type="button" className={kind === 'voice' ? 'on' : ''} onClick={() => setKind('voice')}>🔊 Voz</button>
          </div>
        )}
        <label>{label}<input autoFocus value={v} onChange={(e) => setV(e.target.value)} /></label>
        {err && <div className="error">{err}</div>}
        <div className="row"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy || !v.trim()}>{action}</button></div>
      </form>
    </Modal>
  );
}
