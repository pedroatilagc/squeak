// Contratos tipados com a API (ver docs/GITHUB_INTEGRATION.md) e regras puras de domínio.
// Nada aqui toca em rede nem em React, para poder ser testado isoladamente.

export type ContributionLevel = 'NONE' | 'FIRST_QUARTILE' | 'SECOND_QUARTILE' | 'THIRD_QUARTILE' | 'FOURTH_QUARTILE';

export interface Actor { login: string; avatar_url?: string | null }

export type IntegrationStatus = 'unconfigured' | 'disconnected' | 'connected' | 'reauth_required' | 'planned';
export interface Integration {
  provider: 'github' | 'jira'; name: string; status: IntegrationStatus; mock: boolean;
  account: Actor | null; app_slug: string | null; install_url: string | null; permissions_note: string;
}

export interface DeviceFlow { flow_id: string; user_code: string; verification_uri: string; expires_in: number; interval: number }
export interface DevicePoll { status: 'pending' | 'slow_down' | 'connected' | 'denied' | 'expired'; interval?: number }

export interface Language { name: string; color: string | null; size: number; percent: number }
export interface Repo {
  name_with_owner: string; description: string | null; url: string; stars: number; forks: number;
  primary_language: { name: string; color: string | null } | null; pushed_at: string; is_private: boolean;
}
export interface GithubProfile {
  mock: boolean; login: string; name: string | null; avatar_url: string; bio: string | null; html_url: string;
  company: string | null; location: string | null; followers: number; following: number; public_repos: number; created_at: string;
  repositories: Repo[]; languages: Language[];
}

export interface ContributionDay { date: string; count: number; level: ContributionLevel; color: string; weekday: number }
export interface ContributionWeek { first_day: string; days: ContributionDay[] }
export interface ContributionCalendar {
  mock: boolean; from: string; to: string; total_contributions: number; total_commits: number; total_issues: number;
  total_pull_requests: number; total_reviews: number; restricted_contributions: number; has_restricted: boolean;
  colors: string[]; weeks: ContributionWeek[];
}

export type ActivityType = 'commit' | 'pull_request' | 'review' | 'issue' | 'repository';
export interface ActivityItem {
  id: string; type: ActivityType; title: string; repo: string; url: string; occurred_at: string; author: Actor;
  detail: { count?: number; number?: number; state?: string } | null;
}
export interface ActivityFeed { mock: boolean; from: string; to: string; truncated: boolean; items: ActivityItem[] }

export type PrState = 'open' | 'closed' | 'merged';
export type ReviewStatus = 'approved' | 'changes_requested' | 'review_required' | 'none';
export type ChecksState = 'success' | 'failure' | 'pending' | 'neutral' | 'none' | 'unknown';
export interface PullRequestCard {
  id: string; number: number; title: string; url: string; repo: string; author: Actor; head_ref: string; base_ref: string;
  state: PrState; is_draft: boolean; review_status: ReviewStatus;
  reviewers: { login: string; avatar_url?: string | null; state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED' }[];
  approvals: number; checks: { state: ChecksState; total?: number }; created_at: string; updated_at: string;
}

export interface Installation { id: number; account_login: string; account_avatar_url: string | null; repository_selection: 'all' | 'selected' }
export interface InstallRepo { id: number; full_name: string; private: boolean }
export interface ServerGithub {
  configured: boolean; mock: boolean; can_manage: boolean; install_url: string | null;
  links: { id: string; installation_id: number; repo_id: number; repo_full_name: string; activity_channel_id: string | null }[];
}

export type TeamKind = 'push' | 'pull_request' | 'review' | 'issue' | 'issue_comment' | 'check' | 'workflow' | 'member_joined' | 'channel_created';
export interface TeamEvent {
  id: string; source: 'github' | 'concord'; kind: TeamKind; action: string | null;
  actor: { name: string; avatar_url?: string | null; user_id?: string | null };
  title: string; repo: string | null; url: string | null; occurred_at: string; detail: Record<string, unknown> | null;
}
export interface TeamFeed { items: TeamEvent[]; next_before: string | null; filters: { actors: string[]; repos: string[]; kinds: TeamKind[] } }

// ---------- estados de tela a partir dos erros da API ----------

export type ViewIssue = 'unconfigured' | 'disconnected' | 'reauth' | 'rate_limited' | 'upstream' | 'unauthorized' | 'forbidden' | 'network' | 'error';

export function classifyFailure(status: number, code?: string): ViewIssue {
  switch (code) {
    case 'github_unconfigured': return 'unconfigured';
    case 'github_disconnected': return 'disconnected';
    case 'github_reauth_required': return 'reauth';
    case 'github_rate_limited': return 'rate_limited';
    case 'github_upstream': return 'upstream';
  }
  if (status === 0) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  return 'error';
}

// ---------- pull requests ----------

export type PrFilter = 'all' | 'open' | 'in_review' | 'approved' | 'changes_requested' | 'merged' | 'closed';
export const PR_FILTERS: { id: PrFilter; label: string }[] = [
  { id: 'all', label: 'Todos' }, { id: 'open', label: 'Abertos' }, { id: 'in_review', label: 'Em revisão' },
  { id: 'approved', label: 'Aprovados' }, { id: 'changes_requested', label: 'Mudanças pedidas' },
  { id: 'merged', label: 'Integrados' }, { id: 'closed', label: 'Fechados' },
];

/** Mesma regra do backend: o estado do PR e o das verificações de CI são independentes. */
export function matchesPrFilter(pr: PullRequestCard, f: PrFilter): boolean {
  switch (f) {
    case 'all': return true;
    case 'open': return pr.state === 'open';
    case 'in_review': return pr.state === 'open' && !pr.is_draft && (pr.review_status === 'review_required' || pr.review_status === 'none');
    case 'approved': return pr.state === 'open' && pr.review_status === 'approved';
    case 'changes_requested': return pr.state === 'open' && pr.review_status === 'changes_requested';
    case 'merged': return pr.state === 'merged';
    case 'closed': return pr.state === 'closed';
  }
}

export function prCounts(prs: PullRequestCard[]): Record<PrFilter, number> {
  const out = {} as Record<PrFilter, number>;
  for (const f of PR_FILTERS) out[f.id] = prs.filter((p) => matchesPrFilter(p, f.id)).length;
  return out;
}

export const prStateLabel = (pr: PullRequestCard) => pr.state === 'merged' ? 'Integrado' : pr.state === 'closed' ? 'Fechado' : pr.is_draft ? 'Rascunho' : 'Aberto';
export const reviewLabel = (s: ReviewStatus) => ({ approved: 'Aprovado', changes_requested: 'Mudanças pedidas', review_required: 'Aguardando revisão', none: 'Sem revisão' })[s];
export const checksLabel = (c: PullRequestCard['checks']) => ({
  success: 'CI passou', failure: 'CI falhou', pending: 'CI em andamento', neutral: 'CI neutro', none: 'Sem verificações', unknown: 'CI sem informação',
})[c.state];

// ---------- atividade pessoal ----------

export const ACTIVITY_TYPES: { id: ActivityType; label: string; icon: string }[] = [
  { id: 'commit', label: 'Commits', icon: 'commit' }, { id: 'pull_request', label: 'Pull requests', icon: 'pr' },
  { id: 'review', label: 'Reviews', icon: 'check-circle' }, { id: 'issue', label: 'Issues', icon: 'issue' },
  { id: 'repository', label: 'Repositórios', icon: 'repo' },
];

/** Dia (UTC, `YYYY-MM-DD`) de um instante ISO. O calendário do GitHub também usa datas, então a comparação é direta. */
export const dayOf = (iso: string) => iso.slice(0, 10);

export function filterActivity(items: ActivityItem[], types: Set<ActivityType>, day: string | null): ActivityItem[] {
  return items.filter((i) => types.has(i.type) && (day === null || dayOf(i.occurred_at) === day));
}

export function groupByDay<T extends { occurred_at: string }>(items: T[]): { day: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const i of [...items].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0))) {
    const d = dayOf(i.occurred_at);
    (map.get(d) ?? map.set(d, []).get(d)!).push(i);
  }
  return [...map].map(([day, items]) => ({ day, items }));
}

// ---------- feed da equipe ----------

export const TEAM_KINDS: Record<TeamKind, { label: string; icon: string; tone: 'accent' | 'ok' | 'bad' | 'info' | 'warn' | 'muted' }> = {
  push: { label: 'Commits', icon: 'commit', tone: 'info' },
  pull_request: { label: 'Pull requests', icon: 'pr', tone: 'accent' },
  review: { label: 'Reviews', icon: 'check-circle', tone: 'ok' },
  issue: { label: 'Issues', icon: 'issue', tone: 'warn' },
  issue_comment: { label: 'Comentários', icon: 'message', tone: 'muted' },
  check: { label: 'Verificações', icon: 'shield', tone: 'info' },
  workflow: { label: 'Workflows', icon: 'play', tone: 'info' },
  member_joined: { label: 'Novos membros', icon: 'users', tone: 'ok' },
  channel_created: { label: 'Canais', icon: 'hash', tone: 'muted' },
};

/** Junta eventos novos (WebSocket) à lista sem duplicar o mesmo id e mantendo a ordem por data. */
export function mergeTeamEvents(cur: TeamEvent[], incoming: TeamEvent[]): TeamEvent[] {
  const seen = new Map(cur.map((e) => [e.id, e]));
  for (const e of incoming) seen.set(e.id, e);
  return [...seen.values()].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : a.id < b.id ? 1 : -1));
}

/** O evento satisfaz os filtros ativos? (usado para eventos recebidos ao vivo). */
export function matchesTeamFilters(e: TeamEvent, f: { actor: string; repo: string; kind: string }): boolean {
  return (!f.actor || e.actor.name === f.actor) && (!f.repo || e.repo === f.repo) && (!f.kind || e.kind === f.kind);
}
