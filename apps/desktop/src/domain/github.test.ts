import { describe, expect, it } from 'vitest';
import { busiestDay, dayTitle, formatDay, monthLabels, periodOptions, stepPeriod, streaks } from './contributions';
import {
  classifyFailure, filterActivity, groupByDay, matchesPrFilter, matchesTeamFilters, mergeTeamEvents, prCounts,
  type ActivityItem, type PullRequestCard, type TeamEvent,
} from './github';

const pr = (o: Partial<PullRequestCard>): PullRequestCard => ({
  id: 'x', number: 1, title: 't', url: 'u', repo: 'o/r', author: { login: 'a' }, head_ref: 'f', base_ref: 'main',
  state: 'open', is_draft: false, review_status: 'none', reviewers: [], approvals: 0, checks: { state: 'none' },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...o,
});

describe('filtros de pull request', () => {
  const all = [
    pr({ number: 1 }),
    pr({ number: 2, review_status: 'review_required' }),
    pr({ number: 3, is_draft: true }),
    pr({ number: 4, review_status: 'approved' }),
    pr({ number: 5, review_status: 'changes_requested' }),
    pr({ number: 6, state: 'merged', review_status: 'approved' }),
    pr({ number: 7, state: 'closed' }),
  ];
  const nums = (f: Parameters<typeof matchesPrFilter>[1]) => all.filter((p) => matchesPrFilter(p, f)).map((p) => p.number);

  it('open inclui qualquer PR aberto, inclusive rascunho', () => expect(nums('open')).toEqual([1, 2, 3, 4, 5]));
  it('in_review exclui rascunho, aprovado e com mudanças pedidas', () => expect(nums('in_review')).toEqual([1, 2]));
  it('approved e changes_requested só valem para PR aberto', () => {
    expect(nums('approved')).toEqual([4]);
    expect(nums('changes_requested')).toEqual([5]);
  });
  it('merged e closed são mutuamente exclusivos', () => { expect(nums('merged')).toEqual([6]); expect(nums('closed')).toEqual([7]); });
  it('estado do CI não altera o filtro de estado do PR', () => {
    const failing = pr({ number: 9, checks: { state: 'failure', total: 3 }, review_status: 'approved' });
    expect(matchesPrFilter(failing, 'approved')).toBe(true);
    expect(matchesPrFilter(failing, 'open')).toBe(true);
  });
  it('contagens batem com os filtros', () => {
    const c = prCounts(all);
    expect(c.all).toBe(7); expect(c.open).toBe(5); expect(c.in_review).toBe(2); expect(c.merged).toBe(1);
  });
});

describe('erros da API viram estados de tela', () => {
  it('usa o código tipado antes do status', () => {
    expect(classifyFailure(503, 'github_unconfigured')).toBe('unconfigured');
    expect(classifyFailure(409, 'github_disconnected')).toBe('disconnected');
    expect(classifyFailure(409, 'github_reauth_required')).toBe('reauth');
    expect(classifyFailure(429, 'github_rate_limited')).toBe('rate_limited');
    expect(classifyFailure(502, 'github_upstream')).toBe('upstream');
  });
  it('cai para o status quando não há código', () => {
    expect(classifyFailure(0)).toBe('network');
    expect(classifyFailure(401)).toBe('unauthorized');
    expect(classifyFailure(403)).toBe('forbidden');
    expect(classifyFailure(500)).toBe('error');
  });
});

describe('contribuições', () => {
  const d = (date: string, count: number) => ({ date, count, level: 'NONE' as const, color: '#000', weekday: 0 });

  it('formata o dia civil sem deslocar por fuso', () => {
    expect(formatDay('2026-03-01')).toBe('1 de março de 2026');
    expect(dayTitle(d('2026-03-01', 0))).toBe('Nenhuma contribuição em 1 de março de 2026');
    expect(dayTitle(d('2026-03-01', 1))).toBe('1 contribuição em 1 de março de 2026');
    expect(dayTitle(d('2026-03-01', 7))).toBe('7 contribuições em 1 de março de 2026');
  });

  it('rotula o mês só quando ele muda e sem colar rótulos', () => {
    const weeks = ['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25', '2026-02-01', '2026-02-08', '2026-03-01'].map((first_day) => ({ first_day }));
    // março começa só 2 colunas depois de fevereiro: o rótulo é suprimido para não colar.
    expect(monthLabels(weeks)).toEqual([{ col: 0, label: 'jan' }, { col: 4, label: 'fev' }]);
  });

  it('sequências: maior e atual, ignorando o dia corrente ainda zerado', () => {
    const days = [d('2026-01-01', 1), d('2026-01-02', 2), d('2026-01-03', 3), d('2026-01-04', 0), d('2026-01-05', 1), d('2026-01-06', 1), d('2026-01-07', 0)];
    expect(streaks(days)).toEqual({ longest: 3, current: 2 });
  });
  it('sequência atual é zero quando o último dia com dados foi anteontem e ontem zerou', () => {
    expect(streaks([d('2026-01-01', 1), d('2026-01-02', 0), d('2026-01-03', 0)])).toEqual({ longest: 1, current: 0 });
  });
  it('dia mais movimentado ignora dias zerados', () => {
    expect(busiestDay([d('2026-01-01', 0)])).toBeNull();
    expect(busiestDay([d('2026-01-01', 2), d('2026-01-02', 9), d('2026-01-03', 4)])?.date).toBe('2026-01-02');
  });

  it('períodos: últimos 12 meses + anos, e navegação limitada', () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const ps = periodOptions('2024-05-10T00:00:00Z', now);
    expect(ps.map((p) => p.id)).toEqual(['last12', '2026', '2025', '2024']);
    expect(ps[1].to).toBe('2026-11-08T12:00:00Z');
    expect(ps[2].from).toBe('2025-01-01T00:00:00Z');
    expect(ps[2].to).toBe('2025-12-31T23:59:59Z');
    // nunca passa de 1 ano (limite do GitHub)
    for (const p of ps) expect(new Date(p.to).getTime() - new Date(p.from).getTime()).toBeLessThanOrEqual(366 * 864e5);
    expect(stepPeriod(ps, '2026', -1)).toBe('2025');
    expect(stepPeriod(ps, '2024', -1)).toBe('2024');
    expect(stepPeriod(ps, '2025', 1)).toBe('2026');
    expect(stepPeriod(ps, 'last12', 1)).toBe('last12');
  });
});

describe('atividade', () => {
  const it1 = (id: string, type: ActivityItem['type'], at: string): ActivityItem => ({ id, type, title: id, repo: 'o/r', url: 'u', occurred_at: at, author: { login: 'a' }, detail: null });
  const items = [it1('a', 'commit', '2026-02-01T00:00:00Z'), it1('b', 'issue', '2026-02-01T10:00:00Z'), it1('c', 'commit', '2026-02-03T00:00:00Z')];

  it('filtra por tipo e por dia', () => {
    expect(filterActivity(items, new Set(['commit']), null).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterActivity(items, new Set(['commit', 'issue']), '2026-02-01').map((i) => i.id)).toEqual(['a', 'b']);
    expect(filterActivity(items, new Set(), null)).toEqual([]);
  });
  it('agrupa por dia, mais recente primeiro', () => {
    const g = groupByDay(items);
    expect(g.map((x) => x.day)).toEqual(['2026-02-03', '2026-02-01']);
    expect(g[1].items.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('feed da equipe', () => {
  const ev = (id: string, at: string, o: Partial<TeamEvent> = {}): TeamEvent => ({
    id, source: 'github', kind: 'push', action: null, actor: { name: 'ana' }, title: id, repo: 'o/r', url: null, occurred_at: at, detail: null, ...o,
  });
  it('mescla sem duplicar e ordena por data', () => {
    const cur = [ev('1', '2026-01-01T00:00:00Z'), ev('2', '2026-01-02T00:00:00Z')];
    const out = mergeTeamEvents(cur, [ev('2', '2026-01-02T00:00:00Z', { title: 'novo' }), ev('3', '2026-01-03T00:00:00Z')]);
    expect(out.map((e) => e.id)).toEqual(['3', '2', '1']);
    expect(out.find((e) => e.id === '2')?.title).toBe('novo');
  });
  it('aplica os filtros ativos a eventos ao vivo', () => {
    const e = ev('1', '2026-01-01T00:00:00Z', { kind: 'review' });
    expect(matchesTeamFilters(e, { actor: '', repo: '', kind: '' })).toBe(true);
    expect(matchesTeamFilters(e, { actor: 'ana', repo: 'o/r', kind: 'review' })).toBe(true);
    expect(matchesTeamFilters(e, { actor: 'bia', repo: '', kind: '' })).toBe(false);
    expect(matchesTeamFilters(e, { actor: '', repo: '', kind: 'push' })).toBe(false);
  });
});
