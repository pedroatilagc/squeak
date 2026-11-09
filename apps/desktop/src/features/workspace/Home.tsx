import { useEffect } from 'react';
import type { Channel, Member, ServerDetail } from '../../api';
import { useApp } from '../../app/context';
import { useResource } from '../../app/useResource';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../design/Icon';
import { StateCard } from '../../design/states';
import { workspaceGithubApi, integrationsApi } from '../../infra/githubApi';
import { PullRequestRow } from '../github/PullRequestBoard';
import { EventRow } from './TeamActivity';

/** Visão geral do workspace: só dados reais (conversas não lidas, chamadas em andamento, feed e PRs). */
export function Home({ detail, online, unread, voice, memberById, onOpenText, onJoinVoice }: {
  detail: ServerDetail | null; online: Set<string>; unread: Record<string, number>; voice: Record<string, string[]>; memberById: Map<string, Member>;
  onOpenText: (c: Channel) => void; onJoinVoice: (c: Channel) => void;
}) {
  const { me, go, rt } = useApp();
  const sid = detail?.id ?? '';
  const [feed, reloadFeed] = useResource(() => (sid ? workspaceGithubApi.activity(sid, { limit: 6 }) : Promise.resolve(null)), [sid]);
  const [prs, reloadPrs] = useResource(() => (sid ? workspaceGithubApi.pullRequests(sid, 'open') : Promise.resolve(null)), [sid]);
  const [ints] = useResource(() => integrationsApi.list(), []);
  useEffect(() => rt?.on((e) => { if (e.type === 'github.event' && e.server_id === sid) reloadFeed(); if (e.type === 'github.pr_updated' && e.server_id === sid) reloadPrs(); }), [rt, sid, reloadFeed, reloadPrs]);

  if (!detail) {
    return (
      <div className="area"><div className="area-body">
        <StateCard icon="home" title="Bem-vindo ao Squak">Crie um workspace ou entre com um convite pelo seletor no topo da barra lateral.</StateCard>
      </div></div>
    );
  }

  const unreadChans = detail.channels.filter((c) => c.kind === 'text' && unread[c.id]);
  const liveRooms = detail.channels.filter((c) => c.kind === 'voice' && (voice[c.id] ?? []).length > 0);
  const gh = ints.data?.find((i) => i.provider === 'github');
  const openPrs = prs.data?.items.filter((p) => p.state === 'open').slice(0, 4) ?? [];
  const onlineMembers = detail.members.filter((m) => online.has(m.id));
  const hour = new Date().getHours();

  return (
    <div className="area">
      <header className="area-head"><h2>{hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'}, {me.username}</h2><span className="muted small">{detail.name}</span></header>
      <div className="area-body">
        <div className="home-grid">
          <section className="panel">
            <header className="panel-head"><h3>Conversas</h3></header>
            {unreadChans.length === 0 ? <p className="muted small">Tudo em dia. Nenhum canal com mensagens novas.</p>
              : <ul className="plain-list">{unreadChans.map((c) => <li key={c.id}><button className="row-btn" onClick={() => onOpenText(c)}><Icon name="hash" size={14} /> <span className="grow">{c.name}</span><span className="badge">{unread[c.id]}</span></button></li>)}</ul>}
          </section>

          <section className="panel">
            <header className="panel-head"><h3>Em chamada agora</h3></header>
            {liveRooms.length === 0 ? <p className="muted small">Nenhuma sala de voz em uso.</p>
              : liveRooms.map((c) => (
                <div key={c.id} className="live-room">
                  <div className="grow"><b>{c.name}</b><div className="avatars">{(voice[c.id] ?? []).map((u) => { const m = memberById.get(u); return m && <Avatar key={u} name={m.username} url={m.avatar_url} size={22} />; })}</div></div>
                  <button className="primary" onClick={() => onJoinVoice(c)}><Icon name="volume" /> Entrar</button>
                </div>
              ))}
          </section>

          <section className="panel">
            <header className="panel-head"><h3>Equipe</h3><span className="grow" /><span className="dim small">{onlineMembers.length} online · {detail.members.length} no total</span></header>
            <div className="avatars wrap">{onlineMembers.map((m) => <span key={m.id} title={m.username}><Avatar name={m.username} url={m.avatar_url} size={28} /></span>)}{onlineMembers.length === 0 && <span className="muted small">Ninguém online.</span>}</div>
          </section>

          <section className="panel span-2">
            <header className="panel-head"><h3>Atividade recente</h3><span className="grow" /><button className="ghost" onClick={() => go('activity')}>Ver tudo <Icon name="arrow-right" size={14} /></button></header>
            {feed.status === 'failed' ? <p className="muted small">Não foi possível carregar o feed agora.</p>
              : !feed.data ? <div className="skeleton" style={{ height: 120 }} />
              : feed.data.items.length === 0 ? <p className="muted small">Ainda sem eventos. Conecte repositórios do GitHub ao workspace para ver o andamento aqui.</p>
              : <div className="timeline">{feed.data.items.map((e) => <EventRow key={e.id} e={e} />)}</div>}
          </section>

          <section className="panel">
            <header className="panel-head"><h3>Seu GitHub</h3></header>
            {gh?.status === 'connected' && gh.account
              ? <div className="row start"><Avatar name={gh.account.login} url={gh.account.avatar_url} size={28} /><span className="grow">@{gh.account.login}</span><button onClick={() => go('github', { githubView: 'profile' })}>Abrir perfil</button></div>
              : <div className="stack"><p className="muted small">{gh?.status === 'unconfigured' ? 'A integração ainda precisa ser configurada no servidor.' : 'Conecte sua conta para ver perfil, contribuições e PRs.'}</p><button onClick={() => go('integrations')}><Icon name="plug" /> Integrações</button></div>}
          </section>

          {openPrs.length > 0 && (
            <section className="panel span-3">
              <header className="panel-head"><h3>Pull requests abertos</h3><span className="grow" /><button className="ghost" onClick={() => go('prs')}>Ver todos <Icon name="arrow-right" size={14} /></button></header>
              <div className="pr-list">{openPrs.map((p) => <PullRequestRow key={p.id} pr={p} />)}</div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
