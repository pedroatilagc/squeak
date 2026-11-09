import { useState, type ReactNode } from 'react';
import type { Channel, Member, ServerDetail, ServerSummary, User } from '../../api';
import type { Area, GithubView } from '../../app/context';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../design/Icon';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export interface SidebarProps {
  area: Area; githubView: GithubView; me: User; rtStatus: 'connecting' | 'online' | 'offline';
  servers: ServerSummary[]; detail: ServerDetail | null; isAdmin: boolean;
  cid: string | null; voiceCid: string | null; unread: Record<string, number>; voice: Record<string, string[]>;
  vstate: Record<string, { muted?: boolean; camera?: boolean; screen?: boolean }>; memberById: Map<string, Member>;
  onArea: (a: Area) => void; onGithubView: (v: GithubView) => void; onPickWorkspace: (id: string) => void;
  onOpenText: (c: Channel) => void; onJoinVoice: (c: Channel) => void; onLeaveVoice: () => void; onDeleteChannel: (c: Channel) => void;
  onPalette: () => void; onSettings: () => void; onLogout: () => void;
  dialogs: { create: () => void; join: () => void; invite: () => void; channel: () => void; category: () => void; leave: () => void; remove: () => void; repos: () => void };
}

function NavItem({ icon, label, on, onClick, badge }: { icon: string; label: string; on: boolean; onClick: () => void; badge?: ReactNode }) {
  return <button className={'nav-item' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} onClick={onClick}><Icon name={icon} /><span className="grow">{label}</span>{badge}</button>;
}

export function Sidebar(p: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const current = p.servers.find((s) => s.id === p.detail?.id) ?? null;
  const personal = p.area === 'github' || p.area === 'integrations';
  const voiceChannel = p.detail?.channels.find((c) => c.id === p.voiceCid) ?? null;
  const totalUnread = Object.values(p.unread).reduce((a, b) => a + b, 0);

  const section = (catId: string | null, name: string) => {
    const chans = p.detail!.channels.filter((c) => c.category_id === catId);
    if (!chans.length && catId === null) return null;
    const closed = collapsed.has(catId ?? '');
    return (
      <div key={catId ?? 'none'} className="cat">
        <button className="cat-head" aria-expanded={!closed} onClick={() => setCollapsed((s) => { const n = new Set(s); closed ? n.delete(catId ?? '') : n.add(catId ?? ''); return n; })}>
          <Icon name={closed ? 'chev-right' : 'chev-down'} size={12} /> {name}
        </button>
        {!closed && chans.map((c) => (
          <div key={c.id}>
            <button className={'chan' + (c.id === p.cid && c.kind === 'text' && p.area === 'chat' ? ' active' : '') + (c.id === p.voiceCid ? ' live' : '') + (p.unread[c.id] ? ' unread' : '')}
              onClick={() => (c.kind === 'text' ? p.onOpenText(c) : p.onJoinVoice(c))}
              onContextMenu={(e) => { e.preventDefault(); if (p.isAdmin) p.onDeleteChannel(c); }}
              title={p.isAdmin ? 'Clique direito para excluir' : undefined}>
              <Icon name={c.kind === 'text' ? 'hash' : 'volume'} size={15} /><span className="grow ellip">{c.name}</span>
              {p.unread[c.id] ? <span className="badge">{p.unread[c.id]}</span> : null}
            </button>
            {c.kind === 'voice' && (p.voice[c.id] ?? []).map((uid) => {
              const m = p.memberById.get(uid); const vs = p.vstate[uid] ?? {};
              return m && <div key={uid} className="vmember"><Avatar name={m.username} url={m.avatar_url} size={18} /><span className="ellip">{m.username}</span>{vs.muted && <Icon name="mic" size={12} />}{vs.camera && <Icon name="video" size={12} />}{vs.screen && <Icon name="screen" size={12} />}</div>;
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <aside className="sidebar" aria-label="Navegação">
      <div className="sb-top">
        <WorkspaceSwitcher servers={p.servers} current={current} detail={p.detail} isAdmin={p.isAdmin} onPick={p.onPickWorkspace}
          onCreate={p.dialogs.create} onJoin={p.dialogs.join} onInvite={p.dialogs.invite} onNewChannel={p.dialogs.channel} onNewCategory={p.dialogs.category}
          onLeave={p.dialogs.leave} onDelete={p.dialogs.remove} onManageRepos={p.dialogs.repos} />
        <button className="icon ghost" onClick={p.onPalette} aria-label="Buscar e executar comandos (Ctrl+K)" title="Ctrl+K"><Icon name="search" /></button>
      </div>

      <nav className="sb-nav" aria-label="Workspace">
        <NavItem icon="home" label="Início" on={p.area === 'home'} onClick={() => p.onArea('home')} />
        <NavItem icon="message" label="Mensagens" on={p.area === 'chat'} onClick={() => p.onArea('chat')}
          badge={totalUnread > 0 ? <span className="badge">{totalUnread}</span> : null} />
        <NavItem icon="volume" label="Chamadas" on={p.area === 'calls'} onClick={() => p.onArea('calls')}
          badge={p.voiceCid ? <span className="live-dot" title="Você está em uma chamada" /> : null} />
        <NavItem icon="activity" label="Atividade" on={p.area === 'activity'} onClick={() => p.onArea('activity')} />
        <NavItem icon="pr" label="Pull requests" on={p.area === 'prs'} onClick={() => p.onArea('prs')} />
      </nav>

      <div className="sb-scroll">
        {personal ? (
          <div className="cat">
            <div className="cat-label">{p.area === 'github' ? 'GitHub' : 'Conexões'}</div>
            {p.area === 'github' ? (
              <>
                <NavItem icon="users" label="Perfil" on={p.githubView === 'profile'} onClick={() => p.onGithubView('profile')} />
                <NavItem icon="activity" label="Atividade" on={p.githubView === 'activity'} onClick={() => p.onGithubView('activity')} />
                <NavItem icon="pr" label="Meus pull requests" on={p.githubView === 'prs'} onClick={() => p.onGithubView('prs')} />
              </>
            ) : <p className="dim small side-note">Conecte serviços para trazer o trabalho para dentro das conversas.</p>}
          </div>
        ) : p.detail ? (
          <>
            {p.detail.categories.map((c) => section(c.id, c.name))}
            {section(null, 'Sem categoria')}
          </>
        ) : <div className="empty small">{p.servers.length ? 'Carregando…' : 'Crie ou entre em um workspace pelo seletor acima.'}</div>}
      </div>

      <nav className="sb-nav sb-personal" aria-label="Pessoal">
        <NavItem icon="branch" label="GitHub" on={p.area === 'github'} onClick={() => p.onArea('github')} />
        <NavItem icon="plug" label="Integrações" on={p.area === 'integrations'} onClick={() => p.onArea('integrations')} />
      </nav>

      {voiceChannel && (
        <div className="voice-bar">
          <button className="voice-open" onClick={() => p.onArea('calls')}><span className="live-dot" /><span className="grow"><b>Em chamada</b><small>{voiceChannel.name}</small></span></button>
          <button className="icon ghost" aria-label="Sair da chamada" onClick={p.onLeaveVoice}><Icon name="x" /></button>
        </div>
      )}
      <footer className="userbar">
        <button className="me" onClick={p.onSettings} aria-label="Configurações de voz e conta"><Avatar name={p.me.username} url={p.me.avatar_url} size={28} />
          <span className="grow"><b className="ellip">{p.me.username}</b><small className={p.rtStatus}>{p.rtStatus === 'online' ? (p.me.status_text || 'Online') : p.rtStatus === 'connecting' ? 'Conectando…' : 'Reconectando…'}</small></span></button>
        <button className="icon ghost" onClick={p.onSettings} aria-label="Configurações"><Icon name="sliders" /></button>
        <button className="icon ghost" onClick={p.onLogout} aria-label="Sair da conta"><Icon name="logout" /></button>
      </footer>
    </aside>
  );
}
