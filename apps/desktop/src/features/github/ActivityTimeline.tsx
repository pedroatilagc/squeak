import { useMemo, useState } from 'react';
import { useResource } from '../../app/useResource';
import { Avatar } from '../../components/Avatar';
import { formatDay } from '../../domain/contributions';
import { Icon } from '../../design/Icon';
import { Async, StateCard } from '../../design/states';
import { ACTIVITY_TYPES, filterActivity, groupByDay, type ActivityType } from '../../domain/github';
import { githubApi } from '../../infra/githubApi';
import { openUrl } from '../../native';
import { relTime } from './PullRequestBoard';

const TONE: Record<ActivityType, string> = { commit: 'info', pull_request: 'accent', review: 'ok', issue: 'warn', repository: '' };

/** Timeline pessoal (GraphQL do GitHub). Filtros por tipo e por período; `day` vem da seleção no calendário. */
export function ActivityTimeline({ from, to, day, onClearDay }: { from?: string; to?: string; day: string | null; onClearDay: () => void }) {
  const [types, setTypes] = useState<Set<ActivityType>>(new Set(ACTIVITY_TYPES.map((t) => t.id)));
  const [res, reload] = useResource(() => githubApi.activity(ACTIVITY_TYPES.map((t) => t.id), from, to), [from, to]);
  const toggle = (t: ActivityType) => setTypes((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });

  return (
    <section className="panel">
      <header className="panel-head">
        <h3>Atividade</h3><span className="grow" />
        <div className="seg" role="group" aria-label="Tipos de atividade">
          {ACTIVITY_TYPES.map((t) => (
            <button key={t.id} className={types.has(t.id) ? 'on' : 'ghost'} aria-pressed={types.has(t.id)} onClick={() => toggle(t.id)}><Icon name={t.icon} size={14} /> {t.label}</button>
          ))}
        </div>
        {day && <button className="ghost" onClick={onClearDay}><Icon name="x" size={14} /> {formatDay(day)}</button>}
      </header>
      <Async res={res} reload={reload} rows={4}>
        {(feed) => <Items feed={feed} types={types} day={day} />}
      </Async>
    </section>
  );
}

function Items({ feed, types, day }: { feed: import('../../domain/github').ActivityFeed; types: Set<ActivityType>; day: string | null }) {
  const items = useMemo(() => filterActivity(feed.items, types, day), [feed, types, day]);
  const groups = useMemo(() => groupByDay(items), [items]);
  if (feed.items.length === 0) return <StateCard icon="activity" title="Sem atividade neste período">O GitHub não retornou contribuições para o intervalo escolhido.</StateCard>;
  if (items.length === 0) return <StateCard icon="activity" title="Nada com esses filtros">Ajuste os tipos ou limpe a data selecionada.</StateCard>;
  return (
    <div className="timeline">
      {feed.mock && <div className="callout warn"><Icon name="alert" /> Dados simulados (modo de desenvolvimento).</div>}
      {groups.map((g) => (
        <div key={g.day} className="tl-day">
          <h4>{formatDay(g.day)}</h4>
          {g.items.map((i) => (
            <div key={i.id} className="tl-item">
              <span className={'tl-ic ' + TONE[i.type]}><Icon name={ACTIVITY_TYPES.find((t) => t.id === i.type)!.icon} size={15} /></span>
              <div className="grow">
                <button className="link-title" onClick={() => void openUrl(i.url)}>{i.title}</button>
                <div className="pr-meta"><span className="mono">{i.repo}</span><span><Avatar name={i.author.login} url={i.author.avatar_url} size={14} /> {i.author.login}</span>
                  <span title={new Date(i.occurred_at).toLocaleString('pt-BR')}>{relTime(i.occurred_at)}</span></div>
              </div>
              <button className="icon ghost" aria-label="Abrir no GitHub" onClick={() => void openUrl(i.url)}><Icon name="external" size={14} /></button>
            </div>
          ))}
        </div>
      ))}
      {feed.truncated && <p className="dim small">Mostrando os itens mais recentes: o GitHub limita a quantidade por consulta.</p>}
    </div>
  );
}
