import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../design/Icon';
import {
  checksLabel, matchesPrFilter, prCounts, prStateLabel, PR_FILTERS, reviewLabel, type PrFilter, type PullRequestCard,
} from '../../domain/github';
import { openUrl } from '../../native';
import { StateCard } from '../../design/states';

export const relTime = (iso: string, now = Date.now()) => {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const STATE_ICON = { open: 'pr', merged: 'merge', closed: 'x' } as const;
const CHECK_ICON: Record<PullRequestCard['checks']['state'], { icon: string; tone: string }> = {
  success: { icon: 'check-circle', tone: 'ok' }, failure: { icon: 'x', tone: 'bad' }, pending: { icon: 'clock', tone: 'warn' },
  neutral: { icon: 'shield', tone: '' }, none: { icon: 'shield', tone: 'dim' }, unknown: { icon: 'shield', tone: 'dim' },
};
const REVIEW_TONE = { approved: 'ok', changes_requested: 'bad', review_required: 'warn', none: '' } as const;

export function PullRequestRow({ pr }: { pr: PullRequestCard }) {
  const ck = CHECK_ICON[pr.checks.state];
  const stateTone = pr.state === 'merged' ? 'accent' : pr.state === 'closed' ? 'bad' : pr.is_draft ? '' : 'ok';
  return (
    <article className="pr-row">
      <span className={'pr-state ' + stateTone} title={prStateLabel(pr)}><Icon name={STATE_ICON[pr.state]} size={18} /></span>
      <div className="pr-main">
        <div className="pr-title">
          <button className="link-title" onClick={() => void openUrl(pr.url)} title="Abrir no GitHub">{pr.title}</button>
          <span className={'chip ' + stateTone}>{prStateLabel(pr)}</span>
        </div>
        <div className="pr-meta">
          <span className="mono">{pr.repo}#{pr.number}</span>
          <span><Avatar name={pr.author.login} url={pr.author.avatar_url} size={16} /> {pr.author.login}</span>
          <span className="mono branch"><Icon name="branch" size={12} /> {pr.head_ref} → {pr.base_ref}</span>
          <span title={new Date(pr.updated_at).toLocaleString('pt-BR')}>atualizado {relTime(pr.updated_at)}</span>
        </div>
      </div>
      {/* Duas colunas independentes: revisão (humanos) e verificações (CI). */}
      <div className="pr-review">
        {pr.state === 'open' && <span className={'chip ' + REVIEW_TONE[pr.review_status]}>{reviewLabel(pr.review_status)}</span>}
        <div className="reviewers" aria-label="Revisores">
          {pr.reviewers.slice(0, 5).map((r) => <span key={r.login} className={'rv ' + r.state.toLowerCase()} title={`${r.login}: ${r.state.toLowerCase().replace('_', ' ')}`}><Avatar name={r.login} url={r.avatar_url} size={20} /></span>)}
          {pr.approvals > 0 && <span className="dim small">{pr.approvals} {pr.approvals === 1 ? 'aprovação' : 'aprovações'}</span>}
        </div>
      </div>
      <div className={'pr-checks ' + ck.tone} title={checksLabel(pr.checks)}>
        <Icon name={ck.icon} size={15} /> <span className="small">{checksLabel(pr.checks)}{pr.checks.total ? ` (${pr.checks.total})` : ''}</span>
      </div>
      <button className="icon ghost" aria-label="Abrir no GitHub" onClick={() => void openUrl(pr.url)}><Icon name="external" size={14} /></button>
    </article>
  );
}

/** Lista com filtros e contagens. O filtro roda no cliente sobre o que a API devolveu (nada além disso é exibido). */
export function PullRequestBoard({ items, emptyHint, initial = 'all' }: { items: PullRequestCard[]; emptyHint: string; initial?: PrFilter }) {
  const [f, setF] = useState<PrFilter>(initial);
  const counts = useMemo(() => prCounts(items), [items]);
  const shown = useMemo(() => items.filter((p) => matchesPrFilter(p, f)), [items, f]);
  return (
    <div className="prs">
      <div className="filters" role="tablist" aria-label="Filtrar pull requests">
        {PR_FILTERS.map((x) => (
          <button key={x.id} role="tab" aria-selected={f === x.id} className={'filter' + (f === x.id ? ' on' : '')} onClick={() => setF(x.id)}>
            {x.label} <span className="count">{counts[x.id]}</span>
          </button>
        ))}
      </div>
      {items.length === 0
        ? <StateCard icon="pr" title="Nenhum pull request ainda">{emptyHint}</StateCard>
        : shown.length === 0
          ? <StateCard icon="pr" title="Nada neste filtro">Nenhum pull request corresponde a "{PR_FILTERS.find((x) => x.id === f)?.label}".</StateCard>
          : <div className="pr-list">{shown.map((p) => <PullRequestRow key={p.id} pr={p} />)}</div>}
    </div>
  );
}
