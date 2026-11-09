import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiFailure, type Channel, type ServerDetail, type ServerSummary, type User } from '../api';
import { AppContext, AREA_LABEL, WORKSPACE_AREAS, type Area, type GithubView } from '../app/context';
import { Icon } from '../design/Icon';
import { StateCard } from '../design/states';
import type { Command } from '../domain/commands';
import { Realtime } from '../realtime';
import { GithubArea } from '../features/github/GithubArea';
import { IntegrationsArea } from '../features/integrations/IntegrationsArea';
import { CallsLobby } from '../features/workspace/CallsLobby';
import { CommandPalette } from '../features/workspace/CommandPalette';
import { Home } from '../features/workspace/Home';
import { MembersPanel } from '../features/workspace/MembersPanel';
import { Sidebar } from '../features/workspace/Sidebar';
import { TeamActivity } from '../features/workspace/TeamActivity';
import { TeamPullRequests } from '../features/workspace/TeamPullRequests';
import { WorkspaceGithub } from '../features/workspace/WorkspaceGithub';
import { Chat } from './Chat';
import { Modal, TextPrompt } from './Modal';
import { Settings } from './Settings';
import { VoiceRoom } from './VoiceRoom';

type Dialog = null | 'server' | 'join' | 'channel' | 'category' | 'invite' | 'settings' | 'repos';
type VState = { muted?: boolean; deafened?: boolean; camera?: boolean; screen?: boolean };

const PANEL_KEY = 'squak.members-panel';
const readPanel = () => { try { const v = localStorage.getItem(PANEL_KEY); return v === null ? window.innerWidth >= 1400 : v === '1'; } catch { return false; } };

export function Shell({ token, user, onLogout }: { token: string; user: User; onLogout: () => void }) {
  const [me, setMe] = useState(user);
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [sid, setSid] = useState<string | null>(null);
  const [detail, setDetail] = useState<ServerDetail | null>(null);
  const [area, setArea] = useState<Area>('home');
  const [githubView, setGithubView] = useState<GithubView>('profile');
  const [cid, setCid] = useState<string | null>(null);
  const [voiceCid, setVoiceCid] = useState<string | null>(null);
  const [rt, setRt] = useState<Realtime | null>(null);
  const [rtStatus, setRtStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [onlineRaw, setOnline] = useState<Set<string>>(new Set());
  const [voice, setVoice] = useState<Record<string, string[]>>({});
  const [vstate, setVstate] = useState<Record<string, VState>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [dialog, setDialog] = useState<Dialog>(null);
  const [palette, setPalette] = useState(false);
  const [panelOpen, setPanelOpen] = useState(readPanel);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  const loadServers = useCallback(async () => {
    const list = await api<ServerSummary[]>('GET', '/servers').catch(() => null);
    if (!list) return;
    setServers(list);
    setSid((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null));
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await api<ServerDetail>('GET', `/servers/${id}`);
      setDetail(d); setVoice(d.voice); setOnline(new Set(d.online));
      setCid((cur) => (cur && d.channels.some((c) => c.id === cur) ? cur : d.channels.find((c) => c.kind === 'text')?.id ?? null));
    } catch (e) { if (e instanceof ApiFailure && e.status === 404) void loadServers(); }
  }, [loadServers]);

  useEffect(() => { void loadServers(); }, [loadServers]);
  useEffect(() => { setDetail(null); setCid(null); if (sid) void loadDetail(sid); }, [sid, loadDetail]);

  useEffect(() => {
    const r = new Realtime(token);
    const offS = r.onStatus(setRtStatus);
    r.connect(); setRt(r);
    return () => { offS(); r.close(); };
  }, [token]);

  useEffect(() => {
    if (!rt) return;
    return rt.on((e) => {
      switch (e.type) {
        case 'resync': void loadServers(); if (sid) void loadDetail(sid); break;
        case 'member.joined': case 'member.left': case 'channel.changed': if (e.server_id === sid) void loadDetail(sid!); break;
        case 'server.deleted': void loadServers(); break;
        case 'presence.updated': setOnline((s) => { const n = new Set(s); e.status === 'online' ? n.add(e.user_id) : n.delete(e.user_id); return n; }); break;
        case 'voice.member_joined': setVoice((v) => ({ ...v, [e.channel_id]: [...new Set([...(v[e.channel_id] ?? []), e.user_id])] })); break;
        case 'voice.member_left': setVoice((v) => ({ ...v, [e.channel_id]: (v[e.channel_id] ?? []).filter((u) => u !== e.user_id) })); break;
        case 'voice.state_changed': setVstate((s) => ({ ...s, [e.user_id]: { muted: e.muted, deafened: e.deafened, camera: e.camera, screen: e.screen } })); break;
        case 'message.created':
          // Só conta como não lida se o canal não está aberto na tela agora.
          if ((e.message.channel_id !== cid || area !== 'chat') && e.message.author.id !== me.id) setUnread((u) => ({ ...u, [e.message.channel_id]: (u[e.message.channel_id] ?? 0) + 1 }));
          break;
      }
    });
  }, [rt, sid, cid, area, me.id, loadDetail, loadServers]);

  // Com o WebSocket aberto o próprio usuário está online (o servidor não envia presença para quem acabou de conectar).
  const online = useMemo(() => (rtStatus === 'online' ? new Set([...onlineRaw, me.id]) : onlineRaw), [onlineRaw, rtStatus, me.id]);
  const channel = detail?.channels.find((c) => c.id === cid) ?? null;
  const voiceChannel = detail?.channels.find((c) => c.id === voiceCid) ?? null;
  const isAdmin = detail?.my_role === 'owner' || detail?.my_role === 'admin';
  const memberById = useMemo(() => new Map((detail?.members ?? []).map((m) => [m.id, m])), [detail]);
  const textChannels = useMemo(() => (detail?.channels ?? []).filter((c) => c.kind === 'text'), [detail]);
  const showErr = useCallback((e: unknown) => setError(e instanceof ApiFailure ? e.message : 'Falha inesperada'), []);

  const go = useCallback((a: Area, opts?: { githubView?: GithubView }) => { setArea(a); if (opts?.githubView) setGithubView(opts.githubView); }, []);
  const openText = useCallback((c: Channel) => { setCid(c.id); setUnread((u) => ({ ...u, [c.id]: 0 })); setArea('chat'); }, []);
  const joinVoice = useCallback((c: Channel) => { setVoiceCid(c.id); setArea('calls'); }, []);
  const leaveVoice = useCallback(() => { setVoiceCid(null); setArea((a) => (a === 'calls' ? 'home' : a)); }, []);
  const pickWorkspace = useCallback((id: string) => { setSid(id); setArea((a) => (WORKSPACE_AREAS.includes(a) ? a : 'home')); }, []);
  const openMessages = useCallback(() => { const c = channel ?? textChannels[0]; if (c) openText(c); else setArea('chat'); }, [channel, textChannels, openText]);
  const togglePanel = useCallback(() => setPanelOpen((v) => { const n = !v; try { localStorage.setItem(PANEL_KEY, n ? '1' : '0'); } catch { /* sem armazenamento */ } return n; }), []);
  const onArea = useCallback((a: Area) => (a === 'chat' ? openMessages() : go(a)), [go, openMessages]);

  // Atalhos: Ctrl+K abre a paleta; Ctrl+\ alterna o painel de membros.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); togglePanel(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [togglePanel]);

  const leaveWorkspace = () => { if (detail && confirm('Sair deste workspace?')) api('POST', `/servers/${detail.id}/leave`).then(() => { setSid(null); void loadServers(); }).catch(showErr); };
  const deleteWorkspace = () => { if (detail && confirm(`Excluir "${detail.name}" e todas as mensagens? Não dá para desfazer.`)) api('DELETE', `/servers/${detail.id}`).then(() => { setSid(null); void loadServers(); }).catch(showErr); };
  const deleteChannel = (c: Channel) => { if (confirm(`Excluir o canal "${c.name}"?`)) api('DELETE', `/channels/${c.id}`).catch(showErr); };
  const invite = async () => { if (!detail) return; try { setInviteCode((await api<{ code: string }>('POST', `/servers/${detail.id}/invites`)).code); setDialog('invite'); } catch (e) { showErr(e); } };

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = [
      { id: 'a-home', label: 'Ir para Início', group: 'Navegar', icon: 'home', run: () => go('home') },
      { id: 'a-chat', label: 'Ir para Mensagens', group: 'Navegar', icon: 'message', run: openMessages },
      { id: 'a-calls', label: 'Ir para Chamadas', group: 'Navegar', icon: 'volume', run: () => go('calls') },
      { id: 'a-act', label: 'Ir para Atividade da equipe', group: 'Navegar', icon: 'activity', run: () => go('activity') },
      { id: 'a-prs', label: 'Ir para Pull requests do workspace', group: 'Navegar', icon: 'pr', run: () => go('prs') },
      { id: 'a-gh', label: 'Abrir meu perfil do GitHub', group: 'Navegar', icon: 'branch', keywords: 'contribuições github', run: () => go('github', { githubView: 'profile' }) },
      { id: 'a-ghprs', label: 'Meus pull requests', group: 'Navegar', icon: 'pr', keywords: 'github revisão', run: () => go('github', { githubView: 'prs' }) },
      { id: 'a-int', label: 'Integrações', group: 'Navegar', icon: 'plug', keywords: 'conectar github jira', run: () => go('integrations') },
      { id: 'x-create', label: 'Criar workspace', group: 'Ações', icon: 'plus', run: () => setDialog('server') },
      { id: 'x-join', label: 'Entrar em um workspace com convite', group: 'Ações', icon: 'arrow-right', run: () => setDialog('join') },
      { id: 'x-set', label: 'Configurações de voz e conta', group: 'Ações', icon: 'sliders', run: () => setDialog('settings') },
      { id: 'x-panel', label: 'Alternar painel de membros', group: 'Ações', icon: 'panel-right', hint: 'Ctrl+\\', run: togglePanel },
    ];
    if (detail) {
      out.push({ id: 'x-invite', label: 'Convidar pessoas', group: 'Ações', icon: 'users', run: () => void invite() });
      if (isAdmin) out.push({ id: 'x-repos', label: 'Conectar repositórios do GitHub ao workspace', group: 'Ações', icon: 'repo', run: () => setDialog('repos') });
    }
    if (voiceCid) out.push({ id: 'x-leave', label: 'Sair da chamada', group: 'Ações', icon: 'x', run: leaveVoice });
    out.push({ id: 'x-logout', label: 'Sair da conta', group: 'Ações', icon: 'logout', run: onLogout });
    servers.filter((s) => s.id !== sid).forEach((s) => out.push({ id: 'w-' + s.id, label: s.name, group: 'Workspaces', icon: 'home', hint: 'trocar', run: () => pickWorkspace(s.id) }));
    detail?.channels.forEach((c) => out.push({ id: 'c-' + c.id, label: c.name, group: 'Canais', icon: c.kind === 'text' ? 'hash' : 'volume', hint: c.kind === 'text' ? 'abrir' : 'entrar na chamada', run: () => (c.kind === 'text' ? openText(c) : joinVoice(c)) }));
    detail?.members.forEach((m) => out.push({ id: 'm-' + m.id, label: m.username, group: 'Pessoas', icon: 'users', hint: m.role, run: () => { setPanelOpen(true); setArea('chat'); } }));
    return out;
  }, [detail, servers, sid, isAdmin, voiceCid, go, openMessages, openText, joinVoice, leaveVoice, pickWorkspace, togglePanel, onLogout]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo(() => ({ me, rt, workspace: detail, isAdmin: !!isAdmin, go, logout: onLogout }), [me, rt, detail, isAdmin, go, onLogout]);
  const noWorkspace = !detail && !servers.length;
  const needsWorkspace = (area === 'chat' || area === 'calls' || area === 'activity' || area === 'prs') && !detail;
  const crumb = [detail?.name, AREA_LABEL[area], area === 'chat' && channel ? '#' + channel.name : area === 'calls' && voiceChannel ? voiceChannel.name : null].filter(Boolean) as string[];
  const showPanel = panelOpen && !!detail && area === 'chat';

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <Sidebar area={area} githubView={githubView} me={me} rtStatus={rtStatus} servers={servers} detail={detail} isAdmin={!!isAdmin}
          cid={cid} voiceCid={voiceCid} unread={unread} voice={voice} vstate={vstate} memberById={memberById}
          onArea={onArea} onGithubView={setGithubView} onPickWorkspace={pickWorkspace} onOpenText={openText} onJoinVoice={joinVoice} onLeaveVoice={leaveVoice}
          onDeleteChannel={deleteChannel} onPalette={() => setPalette(true)} onSettings={() => setDialog('settings')} onLogout={onLogout}
          dialogs={{ create: () => setDialog('server'), join: () => setDialog('join'), invite: () => void invite(), channel: () => setDialog('channel'), category: () => setDialog('category'), leave: leaveWorkspace, remove: deleteWorkspace, repos: () => setDialog('repos') }} />

        <div className="main">
          <header className="topbar">
            <nav className="crumbs" aria-label="Localização">{crumb.map((c, i) => <span key={i} className={i === crumb.length - 1 ? 'cur' : ''}>{i > 0 && <Icon name="chev-right" size={12} />} {c}</span>)}</nav>
            <span className="grow" />
            {rtStatus !== 'online' && <span className="chip warn" role="status">{rtStatus === 'connecting' ? 'Conectando…' : 'Reconectando…'}</span>}
            <button className="palette-trigger" onClick={() => setPalette(true)}><Icon name="search" size={14} /> Buscar ou executar <span className="kbd">Ctrl K</span></button>
            {detail && area === 'chat' && <button className={'icon ghost' + (panelOpen ? ' on' : '')} aria-pressed={panelOpen} aria-label="Painel de membros (Ctrl+\)" title="Membros (Ctrl+\)" onClick={togglePanel}><Icon name="panel-right" /></button>}
          </header>

          <div className="sheet-row">
            <main className="sheet">
              {error && <div className="error" role="alert" onClick={() => setError('')}>{error}</div>}
              {/* A sala de voz continua montada fora da aba Chamadas para não derrubar a ligação ao navegar. */}
              {voiceChannel && (
                <div className="voice-host" style={{ display: area === 'calls' ? 'flex' : 'none' }}>
                  <VoiceRoom key={voiceChannel.id} channel={voiceChannel} me={me} rt={rt} onLeave={leaveVoice} onSettings={() => setDialog('settings')} />
                </div>
              )}
              {needsWorkspace && !(area === 'calls' && voiceChannel) ? (
                <div className="area"><div className="area-body"><StateCard icon="home" title={noWorkspace ? 'Você ainda não tem um workspace' : 'Carregando workspace…'}>
                  {noWorkspace ? 'Crie um workspace ou entre com um convite pelo seletor no topo da barra lateral.' : 'Um instante.'}</StateCard></div></div>
              ) : <>
                {area === 'home' && <Home detail={detail} online={online} unread={unread} voice={voice} memberById={memberById} onOpenText={openText} onJoinVoice={joinVoice} />}
                {area === 'chat' && (channel
                  ? <Chat key={channel.id} channel={channel} me={me} members={detail!.members} canModerate={!!isAdmin} rt={rt} onUnread={() => {}} />
                  : <div className="area"><div className="area-body"><StateCard icon="message" title="Escolha um canal de texto">Use a barra lateral ou Ctrl+K para abrir uma conversa.</StateCard></div></div>)}
                {area === 'calls' && !voiceChannel && detail && <CallsLobby detail={detail} voice={voice} memberById={memberById} onJoin={joinVoice} />}
                {area === 'activity' && detail && <TeamActivity serverId={detail.id} onManageRepos={() => setDialog('repos')} />}
                {area === 'prs' && detail && <TeamPullRequests serverId={detail.id} onManageRepos={() => setDialog('repos')} />}
                {area === 'github' && <GithubArea view={githubView} />}
                {area === 'integrations' && <IntegrationsArea />}
              </>}
            </main>
            {showPanel && <MembersPanel detail={detail!} online={online} meId={me.id} isAdmin={!!isAdmin} onChanged={() => void loadDetail(detail!.id)} onError={showErr} onClose={togglePanel} />}
          </div>
        </div>

        {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
        {dialog === 'server' && <TextPrompt title="Criar workspace" label="Nome do workspace" action="Criar" onClose={() => setDialog(null)}
          onSubmit={async (name) => { const s = await api<ServerSummary>('POST', '/servers', { name }); await loadServers(); pickWorkspace(s.id); }} />}
        {dialog === 'join' && <TextPrompt title="Entrar em um workspace" label="Código do convite" action="Entrar" onClose={() => setDialog(null)}
          onSubmit={async (code) => { const r = await api<{ server_id: string }>('POST', `/invites/${encodeURIComponent(code)}/join`).catch(() => { throw new Error('Convite inválido ou expirado'); }); await loadServers(); pickWorkspace(r.server_id); }} />}
        {dialog === 'category' && detail && <TextPrompt title="Nova categoria" label="Nome" action="Criar" onClose={() => setDialog(null)}
          onSubmit={async (name) => { await api('POST', `/servers/${detail.id}/categories`, { name }); await loadDetail(detail.id); }} />}
        {dialog === 'channel' && detail && <TextPrompt title="Novo canal" label="Nome do canal" action="Criar" kindChoice onClose={() => setDialog(null)}
          onSubmit={async (name, kind) => { await api('POST', `/servers/${detail.id}/channels`, { name, kind, category_id: detail.categories[kind === 'text' ? 0 : 1]?.id ?? detail.categories[0]?.id ?? null }); await loadDetail(detail.id); }} />}
        {dialog === 'invite' && <Modal title="Convite do workspace" onClose={() => setDialog(null)}>
          <p className="muted">Compartilhe este código. Vale por 7 dias.</p>
          <input readOnly value={inviteCode} onFocus={(e) => e.currentTarget.select()} />
          <div className="row"><button onClick={() => navigator.clipboard.writeText(inviteCode)}><Icon name="copy" /> Copiar</button><button className="primary" onClick={() => setDialog(null)}>Fechar</button></div>
        </Modal>}
        {dialog === 'repos' && detail && <WorkspaceGithub serverId={detail.id} textChannels={textChannels} onClose={() => setDialog(null)} />}
        {dialog === 'settings' && <Settings me={me} onClose={() => setDialog(null)} onMe={setMe} />}
      </div>
    </AppContext.Provider>
  );
}
