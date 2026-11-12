import { useEffect, useMemo, useRef, useState } from 'react';
import type { ServerDetail, ServerSummary } from '../../api';
import { Icon } from '../../design/Icon';
import { normalize } from '../../domain/commands';

const FAV_KEY = 'squak.favorites';
export const loadFavorites = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]')); } catch { return new Set(); } };
const saveFavorites = (s: Set<string>) => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...s])); } catch { /* sem armazenamento: favoritos só nesta sessão */ } };

export function WorkspaceMark({ s, size = 22 }: { s: Pick<ServerSummary, 'name' | 'icon_url'>; size?: number }) {
  return <span className="ws-mark" style={{ width: size, height: size, fontSize: size * 0.46 }}>{s.icon_url ? <img src={s.icon_url} alt="" /> : s.name.slice(0, 1).toUpperCase()}</span>;
}

/** Troca de workspace por lista com busca e favoritos, no lugar de uma pilha vertical de ícones. */
export function WorkspaceSwitcher({ servers, current, detail, isAdmin, onPick, onCreate, onJoin, onInvite, onNewChannel, onNewCategory, onLeave, onDelete, onManageRepos }: {
  servers: ServerSummary[]; current: ServerSummary | null; detail: ServerDetail | null; isAdmin: boolean;
  onPick: (id: string) => void; onCreate: () => void; onJoin: () => void; onInvite: () => void; onNewChannel: () => void; onNewCategory: () => void;
  onLeave: () => void; onDelete: () => void; onManageRepos: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [fav, setFav] = useState(loadFavorites);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', esc); };
  }, [open]);

  const list = useMemo(() => {
    const nq = normalize(q);
    return servers.filter((s) => normalize(s.name).includes(nq)).sort((a, b) => Number(fav.has(b.id)) - Number(fav.has(a.id)));
  }, [servers, q, fav]);
  const toggleFav = (id: string) => setFav((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); saveFavorites(n); return n; });
  const close = (f: () => void) => () => { setOpen(false); f(); };

  return (
    <div className="switcher" ref={box}>
      <button className="switcher-btn" onClick={() => { setOpen((o) => !o); setQ(''); }} aria-haspopup="menu" aria-expanded={open}>
        {current ? <WorkspaceMark s={current} /> : <span className="ws-mark">+</span>}
        <span className="grow ellip"><b>{current?.name ?? 'Sem workspace'}</b></span><Icon name="chev-down" size={14} />
      </button>
      {open && (
        <div className="pop switcher-pop" role="menu">
          <input autoFocus placeholder="Buscar workspace…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar workspace" />
          <div className="sw-list">
            {list.length === 0 && <div className="dim small sw-empty">{servers.length ? 'Nenhum resultado' : 'Você ainda não participa de nenhum workspace'}</div>}
            {list.map((s) => (
              <div key={s.id} className={'sw-item' + (s.id === current?.id ? ' on' : '')}>
                <button className="sw-pick" onClick={close(() => onPick(s.id))} role="menuitem"><WorkspaceMark s={s} /><span className="grow ellip">{s.name}</span>{s.id === current?.id && <Icon name="check" size={14} />}</button>
                <button className={'icon ghost fav' + (fav.has(s.id) ? ' on' : '')} aria-label={fav.has(s.id) ? 'Remover dos favoritos' : 'Favoritar'} aria-pressed={fav.has(s.id)} onClick={() => toggleFav(s.id)}><Icon name="star" size={14} fill={fav.has(s.id)} /></button>
              </div>
            ))}
          </div>
          <div className="sw-sep" />
          <button className="menu-item" onClick={close(onCreate)} role="menuitem"><Icon name="plus" /> Criar workspace</button>
          <button className="menu-item" onClick={close(onJoin)} role="menuitem"><Icon name="arrow-right" /> Entrar com convite</button>
          {detail && (
            <>
              <div className="sw-sep" />
              <div className="menu-label">{detail.name}</div>
              <button className="menu-item" onClick={close(onInvite)} role="menuitem"><Icon name="users" /> Convidar pessoas</button>
              {isAdmin && <button className="menu-item" onClick={close(onNewChannel)} role="menuitem"><Icon name="hash" /> Novo canal</button>}
              {isAdmin && <button className="menu-item" onClick={close(onNewCategory)} role="menuitem"><Icon name="plus" /> Nova categoria</button>}
              {isAdmin && <button className="menu-item" onClick={close(onManageRepos)} role="menuitem"><Icon name="repo" /> Repositórios do GitHub</button>}
              {detail.my_role === 'owner'
                ? <button className="menu-item danger" onClick={close(onDelete)} role="menuitem"><Icon name="x" /> Excluir workspace</button>
                : <button className="menu-item danger" onClick={close(onLeave)} role="menuitem"><Icon name="logout" /> Sair do workspace</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
