import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiFailure } from '../../api';
import { useApp } from '../../app/context';
import { Avatar } from '../../components/Avatar';
import { formatDay } from '../../domain/contributions';
import { Icon } from '../../design/Icon';
import { IssueView, LoadingBlock, StateCard } from '../../design/states';
import {
  classifyFailure, groupByDay, matchesTeamFilters, mergeTeamEvents, TEAM_KINDS, type TeamEvent, type TeamFeed, type TeamKind, type ViewIssue,
} from '../../domain/github';
import { workspaceGithubApi } from '../../infra/githubApi';
import { openUrl } from '../../native';
import { relTime } from '../github/PullRequestBoard';

type Filters = { actor: string; repo: string; kind: string };
const NONE: Filters = { actor: '', repo: '', kind: '' };

export function TeamActivity({ serverId, onManageRepos }: { serverId: string; onManageRepos: () => void }) {
  const { rt, isAdmin } = useApp();
  const [f, setF] = useState<Filters>(NONE);
  const [events, setEvents] = useState<TeamEvent[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [options, setOptions] = useState<TeamFeed['filters']>({ actors: [], repos: [], kinds: [] });
  const [issue, setIssue] = useState<{ issue: ViewIssue; message: string } | null>(null);
  const [more, setMore] = useState(false);
  const fRef = useRef(f); fRef.current = f;
  const seq = useRef(0);

  const load = useCallback(async (filters: Filters) => {
    const mine = ++seq.current;
    setIssue(null);
    try {
      const r = await workspaceGithubApi.activity(serverId, { actor: filters.actor, repo: filters.repo, kind: filters.kind });
      if (mine !== seq.current) return;
      setEvents(r.items); setNext(r.next_before);
      // As opções vêm da consulta sem filtro; com filtro, só acrescentamos valores novos.
      setOptions((o) => ({
        actors: [...new Set([...o.actors, ...r.filters.actors])].sort(), repos: [...new Set([...o.repos, ...r.filters.repos])].sort(),
        kinds: [...new Set([...o.kinds, ...r.filters.kinds])] as TeamKind[],
      }));
    } catch (e) {
      if (mine !== seq.current) return;
      const x = e instanceof ApiFailure ? e : null;
      setIssue({ issue: x ? classifyFailure(x.status, x.code) : 'error', message: x?.message ?? 'Falha inesperada' });
    }
  }, [serverId]);

  useEffect(() => { setEvents(null); setF(NONE); setOptions({ actors: [], repos: [], kinds: [] }); void load(NONE); }, [serverId, load]);

  // Tempo real: eventos do GitHub entram na hora; mudanças de membros/canais recarregam o feed.
  useEffect(() => rt?.on((e) => {
    if (e.type === 'github.event' && e.server_id === serverId) {
      const item = e.item as TeamEvent;
      if (matchesTeamFilters(item, fRef.current)) setEvents((cur) => mergeTeamEvents(cur ?? [], [item]));
    } else if ((e.type === 'resync' || e.type === 'member.joined' || e.type === 'channel.changed') && (e.server_id === serverId || e.type === 'resync')) void load(fRef.current);
  }), [rt, serverId, load]);

  const apply = (patch: Partial<Filters>) => { const n = { ...f, ...patch }; setF(n); setEvents(null); void load(n); };
  const loadMore = async () => {
    if (!next) return;
    setMore(true);
    try { const r = await workspaceGithubApi.activity(serverId, { ...f, before: next }); setEvents((c) => mergeTeamEvents(c ?? [], r.items)); setNext(r.next_before); }
    catch { /* mantém o que já está na tela; o botão continua disponível */ } finally { setMore(false); }
  };

  const filtered = f.actor || f.repo || f.kind;
  return (
    <div className="area">
      <header className="area-head">
        <Icon name="activity" size={18} /><h2>Atividade da equipe</h2><span className="grow" />
        {isAdmin && <button onClick={onManageRepos}><Icon name="repo" /> Repositórios conectados</button>}
      </header>
      <div className="filter-bar">
        <label className="inline-label">Pessoa <select value={f.actor} onChange={(e) => apply({ actor: e.target.value })}><option value="">Todas</option>{options.actors.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="inline-label">Repositório <select value={f.repo} onChange={(e) => apply({ repo: e.target.value })}><option value="">Todos</option>{options.repos.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="inline-label">Evento <select value={f.kind} onChange={(e) => apply({ kind: e.target.value })}><option value="">Todos</option>{options.kinds.map((k) => <option key={k} value={k}>{TEAM_KINDS[k]?.label ?? k}</option>)}</select></label>
        {filtered && <button className="ghost" onClick={() => apply(NONE)}><Icon name="x" size={14} /> Limpar filtros</button>}
        <span className="grow" />
        <span className="dim small">Mostra o andamento do trabalho, não presença nem horários.</span>
      </div>
      <div className="area-body">
        {issue ? <IssueView issue={issue.issue} message={issue.message} onRetry={() => void load(f)} />
          : events === null ? <LoadingBlock rows={5} />
          : events.length === 0 ? (
            <StateCard icon="activity" title={filtered ? 'Nenhum evento com esses filtros' : 'Ainda não há atividade'}
              actions={!filtered && isAdmin ? <button className="primary" onClick={onManageRepos}><Icon name="repo" /> Conectar repositórios</button> : undefined}>
              {filtered ? 'Limpe os filtros para ver todo o feed.' : 'Eventos do GitHub aparecem aqui quando um repositório é conectado a este workspace e recebe push, PR, review ou CI. Entradas de membros e novos canais também.'}
            </StateCard>
          ) : (
            <div className="timeline">
              {groupByDay(events).map((g) => (
                <div key={g.day} className="tl-day">
                  <h4>{formatDay(g.day)}</h4>
                  {g.items.map((e) => <EventRow key={e.id} e={e} />)}
                </div>
              ))}
              {next && <button className="more" onClick={loadMore} disabled={more}>{more ? 'Carregando…' : 'Carregar mais'}</button>}
            </div>
          )}
      </div>
    </div>
  );
}

export function EventRow({ e }: { e: TeamEvent }) {
  const k = TEAM_KINDS[e.kind] ?? { icon: 'activity', tone: 'muted', label: e.kind };
  return (
    <div className="tl-item">
      <span className={'tl-ic ' + (k.tone === 'muted' ? '' : k.tone)}><Icon name={k.icon} size={15} /></span>
      <Avatar name={e.actor.name} url={e.actor.avatar_url} size={22} />
      <div className="grow">
        <div>{e.url ? <button className="link-title" onClick={() => void openUrl(e.url!)}>{e.title}</button> : <span>{e.title}</span>}</div>
        <div className="pr-meta">
          {e.repo && <span className="mono">{e.repo}</span>}
          <span className={'chip ' + (e.source === 'github' ? '' : 'accent')}>{e.source === 'github' ? 'GitHub' : 'Squak'}</span>
          <span title={new Date(e.occurred_at).toLocaleString('pt-BR')}>{relTime(e.occurred_at)}</span>
        </div>
      </div>
      {e.url && <button className="icon ghost" aria-label="Abrir o evento original" onClick={() => void openUrl(e.url!)}><Icon name="external" size={14} /></button>}
    </div>
  );
}
