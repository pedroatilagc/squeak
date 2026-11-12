import { useMemo } from 'react';
import { api, type Member, type ServerDetail } from '../../api';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../design/Icon';

/** Painel de contexto opcional (Ctrl+\): quem está no workspace. Clique direito expulsa (admin); o dono alterna o papel de admin. */
export function MembersPanel({ detail, online, meId, isAdmin, onChanged, onError, onClose }: {
  detail: ServerDetail; online: Set<string>; meId: string; isAdmin: boolean; onChanged: () => void; onError: (e: unknown) => void; onClose: () => void;
}) {
  const groups = useMemo(() => {
    const by = (f: (m: Member) => boolean) => detail.members.filter(f);
    return [
      ['Administradores', by((m) => (m.role === 'owner' || m.role === 'admin') && online.has(m.id))],
      ['Online', by((m) => m.role === 'member' && online.has(m.id))],
      ['Offline', by((m) => !online.has(m.id))],
    ] as [string, Member[]][];
  }, [detail, online]);

  return (
    <aside className="panel-side" aria-label="Membros">
      <header className="panel-side-head"><b>Membros</b><span className="dim small">{detail.members.length}</span><span className="grow" />
        <button className="icon ghost" aria-label="Fechar painel" onClick={onClose}><Icon name="x" size={14} /></button></header>
      {groups.map(([title, ms]) => ms.length > 0 && (
        <div key={title}>
          <h4>{title} · {ms.length}</h4>
          {ms.map((m) => (
            <div key={m.id} className={'member' + (online.has(m.id) ? '' : ' off')}
              onContextMenu={(e) => { e.preventDefault(); if (!isAdmin || m.id === meId || m.role === 'owner') return; if (confirm(`Expulsar ${m.username}?`)) api('DELETE', `/servers/${detail.id}/members/${m.id}`).catch(onError); }}>
              <span className="av"><Avatar name={m.username} url={m.avatar_url} size={28} /><i className={online.has(m.id) ? 'dot on' : 'dot'} /></span>
              <span className="mn"><b>{m.username}{m.role === 'owner' ? ' · dono' : m.role === 'admin' ? ' · admin' : ''}</b>{m.status_text && <small>{m.status_text}</small>}</span>
              {detail.my_role === 'owner' && m.id !== meId && (
                <button className="ghost role" title="Alternar administrador" onClick={() => api('PATCH', `/servers/${detail.id}/members/${m.id}`, { role: m.role === 'admin' ? 'member' : 'admin' }).then(onChanged).catch(onError)}>{m.role === 'admin' ? '−adm' : '+adm'}</button>
              )}
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}
