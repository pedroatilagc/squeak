import { useEffect, useMemo, useRef, useState } from 'react';
import { rankCommands, type Command } from '../../domain/commands';
import { Icon } from '../../design/Icon';

/** Ctrl+K: navegar, trocar de workspace, abrir canais e executar ações. Cada item é uma ação real do app. */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = useMemo(() => rankCommands(commands, q), [commands, q]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => setI(0), [q]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }, [i]);

  const run = (c: Command | undefined) => { if (!c) return; onClose(); c.run(); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(list.length - 1, n + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(list[i]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = '';
  return (
    <div className="modal-back top" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Paleta de comandos" onMouseDown={(e) => e.stopPropagation()} onKeyDown={key}>
        <div className="palette-input"><Icon name="search" /><input autoFocus placeholder="Buscar canal, workspace ou ação…" value={q} onChange={(e) => setQ(e.target.value)}
          role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={list[i] ? 'cmd-' + list[i].id : undefined} /></div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {list.length === 0 && <div className="empty small">Nada encontrado para "{q}".</div>}
          {list.map((c, idx) => {
            const head = c.group !== lastGroup ? (lastGroup = c.group) : null;
            return (
              <div key={c.id}>
                {head && <div className="palette-group">{head}</div>}
                <button id={'cmd-' + c.id} role="option" aria-selected={idx === i} className={'palette-item' + (idx === i ? ' on' : '')} onMouseMove={() => setI(idx)} onClick={() => run(c)}>
                  <Icon name={c.icon} /> <span className="grow ellip">{c.label}</span>{c.hint && <span className="dim small">{c.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot dim small"><span><span className="kbd">↑↓</span> navegar</span><span><span className="kbd">Enter</span> executar</span><span><span className="kbd">Esc</span> fechar</span></div>
      </div>
    </div>
  );
}
