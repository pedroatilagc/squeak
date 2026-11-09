import { createContext, useContext } from 'react';
import type { Realtime } from '../realtime';
import type { ServerDetail, User } from '../api';

/** Áreas de navegação. `home`, `chat`, `calls`, `activity` e `prs` pertencem a um workspace; `github` e `integrations` são pessoais. */
export type Area = 'home' | 'chat' | 'calls' | 'activity' | 'prs' | 'github' | 'integrations';
export type GithubView = 'profile' | 'activity' | 'prs';

export const AREA_LABEL: Record<Area, string> = {
  home: 'Início', chat: 'Mensagens', calls: 'Chamadas', activity: 'Atividade', prs: 'Pull requests', github: 'GitHub', integrations: 'Integrações',
};
export const WORKSPACE_AREAS: Area[] = ['home', 'chat', 'calls', 'activity', 'prs'];

export interface AppCtx {
  me: User;
  rt: Realtime | null;
  /** Workspace ativo (null quando o usuário ainda não tem nenhum). */
  workspace: ServerDetail | null;
  isAdmin: boolean;
  go: (area: Area, opts?: { githubView?: GithubView }) => void;
  logout: () => void;
}

export const AppContext = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(AppContext);
  if (!c) throw new Error('AppContext ausente');
  return c;
};
