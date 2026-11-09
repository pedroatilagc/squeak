// Única porta de entrada do front para as rotas de integração. Componentes não montam URLs.
import { api } from '../api';
import type {
  ActivityFeed, ActivityType, ContributionCalendar, DeviceFlow, DevicePoll, GithubProfile, Installation, InstallRepo, Integration,
  PrFilter, PullRequestCard, ServerGithub, TeamFeed,
} from '../domain/github';

const qs = (o: Record<string, string | number | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const integrationsApi = {
  list: () => api<{ integrations: Integration[] }>('GET', '/integrations').then((r) => r.integrations),
};

export const githubApi = {
  startDevice: () => api<DeviceFlow>('POST', '/integrations/github/device'),
  pollDevice: (flow_id: string) => api<DevicePoll>('POST', '/integrations/github/device/poll', { flow_id }),
  disconnect: () => api<{ ok: true }>('DELETE', '/integrations/github'),

  profile: () => api<GithubProfile>('GET', '/github/profile'),
  contributions: (from?: string, to?: string) => api<ContributionCalendar>('GET', '/github/contributions' + qs({ from, to })),
  activity: (types: ActivityType[], from?: string, to?: string) =>
    api<ActivityFeed>('GET', '/github/activity' + qs({ types: types.join(','), from, to, limit: 100 })),
  pullRequests: (role: 'authored' | 'review_requested') => api<{ mock: boolean; items: PullRequestCard[] }>('GET', '/github/pull-requests' + qs({ role })),

  installations: () => api<{ mock: boolean; items: Installation[] }>('GET', '/github/installations'),
  installationRepos: (id: number) => api<{ items: InstallRepo[] }>('GET', `/github/installations/${id}/repositories`),
};

export const workspaceGithubApi = {
  get: (sid: string) => api<ServerGithub>('GET', `/servers/${sid}/github`),
  put: (sid: string, body: { installation_id: number; repos: { id: number; full_name: string }[]; activity_channel_id: string | null }) =>
    api<ServerGithub>('PUT', `/servers/${sid}/github/repos`, body),
  unlink: (sid: string, linkId: string) => api<{ ok: true }>('DELETE', `/servers/${sid}/github/repos/${linkId}`),
  activity: (sid: string, f: { actor?: string; repo?: string; kind?: string; before?: string | null; limit?: number }) =>
    api<TeamFeed>('GET', `/servers/${sid}/activity` + qs({ ...f, limit: f.limit ?? 50 })),
  pullRequests: (sid: string, state?: PrFilter) =>
    api<{ items: PullRequestCard[] }>('GET', `/servers/${sid}/pull-requests` + qs({ state: state && state !== 'all' ? state : undefined })),
};
