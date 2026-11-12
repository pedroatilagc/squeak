import { useEffect, useMemo, useState } from 'react';
import { useResource } from '../../app/useResource';
import { Icon } from '../../design/Icon';
import { Async } from '../../design/states';
import { busiestDay, dayTitle, flatten, formatDay, levelIndex, monthLabels, periodOptions, stepPeriod, streaks } from '../../domain/contributions';
import type { ContributionCalendar } from '../../domain/github';
import { githubApi } from '../../infra/githubApi';

const CELL = 12, STEP = 15, LEFT = 30, TOP = 20;
const WEEKDAYS: [number, string][] = [[1, 'seg'], [3, 'qua'], [5, 'sex']];

/** Dias sem contribuição: o GitHub devolve um cinza claro pensado para tema claro, então usamos a superfície do app. Os demais níveis usam a cor real da API. */
const cellColor = (d: { level: Parameters<typeof levelIndex>[0]; color: string }) => (levelIndex(d.level) === 0 ? 'var(--s3)' : d.color);

export function ContributionGraph({ cal, selected, onSelect }: { cal: ContributionCalendar; selected: string | null; onSelect: (day: string | null) => void }) {
  const [hover, setHover] = useState<{ title: string; x: number; y: number } | null>(null);
  const labels = useMemo(() => monthLabels(cal.weeks), [cal]);
  const w = LEFT + cal.weeks.length * STEP, h = TOP + 7 * STEP;
  return (
    <div className="cg">
      <svg viewBox={`0 0 ${w} ${h}`} className="cg-svg" role="img" aria-label={`${cal.total_contributions} contribuições no período`} onMouseLeave={() => setHover(null)}>
        {labels.map((l) => <text key={l.col} x={LEFT + l.col * STEP} y={11} className="cg-label">{l.label}</text>)}
        {WEEKDAYS.map(([row, t]) => <text key={t} x={0} y={TOP + row * STEP + 10} className="cg-label">{t}</text>)}
        {cal.weeks.map((wk, col) => wk.days.map((d) => (
          <rect key={d.date} x={LEFT + col * STEP} y={TOP + d.weekday * STEP} width={CELL} height={CELL} rx={2.5} fill={cellColor(d)}
            className={'cg-cell' + (selected === d.date ? ' sel' : '')} data-date={d.date} data-count={d.count}
            onClick={() => onSelect(selected === d.date ? null : d.date)}
            onMouseEnter={(e) => { const r = (e.target as SVGRectElement).getBoundingClientRect(); setHover({ title: dayTitle(d), x: r.left + r.width / 2, y: r.top }); }} />
        )))}
      </svg>
      {hover && <div className="cg-tip" style={{ left: hover.x, top: hover.y }} role="tooltip">{hover.title}</div>}
      <div className="cg-legend" aria-label="Legenda de intensidade">
        <span className="dim small">Menos</span>
        {cal.colors.map((c, i) => <i key={i} style={{ background: i === 0 ? 'var(--s3)' : c }} />)}
        <span className="dim small">Mais</span>
      </div>
    </div>
  );
}

/** Painel completo: período, calendário, totais e seleção de data. `onDay` informa o dia escolhido para filtrar a timeline. */
export function ContributionsPanel({ createdAt, day, onDay, onPeriod }: {
  createdAt?: string; day: string | null; onDay: (d: string | null) => void; onPeriod?: (p: { from: string; to: string }) => void;
}) {
  const periods = useMemo(() => periodOptions(createdAt, new Date()), [createdAt]);
  const [pid, setPid] = useState('last12');
  const period = periods.find((p) => p.id === pid) ?? periods[0];
  useEffect(() => { onPeriod?.({ from: period.from, to: period.to }); }, [period.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [res, reload] = useResource(() => githubApi.contributions(period.from, period.to), [period.id]);
  const idx = periods.findIndex((p) => p.id === pid);

  return (
    <section className="panel">
      <header className="panel-head">
        <h3>Contribuições</h3>
        <span className="grow" />
        <button className="icon ghost" aria-label="Período mais antigo" disabled={idx >= periods.length - 1} onClick={() => setPid(stepPeriod(periods, pid, -1))}><Icon name="arrow-left" /></button>
        <select aria-label="Período" value={pid} onChange={(e) => { setPid(e.target.value); onDay(null); }}>{periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <button className="icon ghost" aria-label="Período mais recente" disabled={idx <= 0} onClick={() => setPid(stepPeriod(periods, pid, 1))}><Icon name="arrow-right" /></button>
        <input type="date" aria-label="Selecionar data" className="date-pick" value={day ?? ''}
          min={period.from.slice(0, 10)} max={period.to.slice(0, 10)} onChange={(e) => onDay(e.target.value || null)} />
        {day && <button className="ghost" onClick={() => onDay(null)}><Icon name="x" size={14} /> {formatDay(day)}</button>}
      </header>
      <Async res={res} reload={reload} rows={2}>
        {(cal, refreshing) => <Body cal={cal} refreshing={refreshing} day={day} onDay={onDay} />}
      </Async>
    </section>
  );
}

function Body({ cal, refreshing, day, onDay }: { cal: ContributionCalendar; refreshing: boolean; day: string | null; onDay: (d: string | null) => void }) {
  const days = useMemo(() => flatten(cal), [cal]);
  const st = useMemo(() => streaks(days), [days]);
  const best = useMemo(() => busiestDay(days), [days]);
  const picked = day ? days.find((d) => d.date === day) : null;
  return (
    <div className={'cg-wrap' + (refreshing ? ' stale' : '')}>
      {cal.mock && <div className="callout warn"><Icon name="alert" /> Dados simulados (modo de desenvolvimento).</div>}
      <div className="cg-main">
        <div className="cg-stats">
          <div><div className="big-num">{cal.total_contributions.toLocaleString('pt-BR')}</div>
            <div className="muted small">contribuições no período <span className="dim">(commits, issues, PRs e reviews; não só commits)</span></div></div>
          <dl className="kv">
            <div><dt>Commits</dt><dd>{cal.total_commits}</dd></div><div><dt>Pull requests</dt><dd>{cal.total_pull_requests}</dd></div>
            <div><dt>Reviews</dt><dd>{cal.total_reviews}</dd></div><div><dt>Issues</dt><dd>{cal.total_issues}</dd></div>
            <div><dt>Maior sequência</dt><dd>{st.longest} {st.longest === 1 ? 'dia' : 'dias'}</dd></div><div><dt>Sequência atual</dt><dd>{st.current} {st.current === 1 ? 'dia' : 'dias'}</dd></div>
            {best && <div className="wide"><dt>Dia mais movimentado</dt><dd>{formatDay(best.date)} · {best.count}</dd></div>}
          </dl>
        </div>
        <div className="cg-graph">
          <ContributionGraph cal={cal} selected={day} onSelect={onDay} />
          {picked && <p className="small cg-picked"><Icon name="calendar" size={13} /> {dayTitle(picked)}. A timeline abaixo mostra só esse dia.</p>}
        </div>
      </div>
      {cal.has_restricted && (
        <p className="callout"><Icon name="lock" /> {cal.restricted_contributions} contribuições em repositórios privados foram contadas de forma anônima, porque você habilitou
          "Private contributions" no seu perfil do GitHub. O Squak só recebe o número, nunca nomes de repositórios privados nessa contagem.</p>
      )}
    </div>
  );
}
