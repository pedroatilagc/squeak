import type { ReactNode } from 'react';
import { useApp } from '../app/context';
import type { Resource } from '../app/useResource';
import type { ViewIssue } from '../domain/github';
import { Icon } from './Icon';

/** Cartão de estado centralizado no conteúdo: vazio, erro, desconectado… Nunca é decorativo: sempre diz o que fazer. */
export function StateCard({ icon, tone = 'muted', title, children, actions }: {
  icon: string; tone?: 'muted' | 'warn' | 'bad' | 'accent' | 'ok'; title: string; children?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className={'state-card ' + tone} role={tone === 'bad' ? 'alert' : 'status'}>
      <span className="state-ic"><Icon name={icon} size={20} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function LoadingBlock({ rows = 3, label = 'Carregando…' }: { rows?: number; label?: string }) {
  return (
    <div className="loading-block" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 52, opacity: 1 - i * 0.18 }} />)}
    </div>
  );
}

export function IssueView({ issue, message, onRetry }: { issue: ViewIssue; message: string; onRetry?: () => void }) {
  const { go, logout } = useApp();
  const retry = onRetry && <button onClick={onRetry}><Icon name="refresh" /> Tentar de novo</button>;
  const connect = <button className="primary" onClick={() => go('integrations')}><Icon name="plug" /> Ir para Integrações</button>;
  switch (issue) {
    case 'unconfigured':
      return <StateCard icon="plug" tone="warn" title="Integração com o GitHub pendente de configuração" actions={connect}>
        O servidor ainda não tem as credenciais da GitHub App. Crie a app e preencha o <span className="mono">.env</span> seguindo
        <span className="mono"> docs/GITHUB_INTEGRATION.md</span>. Enquanto isso, nenhum dado do GitHub é exibido.</StateCard>;
    case 'disconnected':
      return <StateCard icon="unlink" tone="accent" title="Conecte sua conta GitHub" actions={connect}>
        A conexão é independente do seu login no Squak e pode ser desfeita a qualquer momento.</StateCard>;
    case 'reauth':
      return <StateCard icon="lock" tone="warn" title="A autorização do GitHub expirou" actions={connect}>
        O GitHub recusou o token salvo (revogado ou expirado). Reconecte para continuar.</StateCard>;
    case 'rate_limited':
      return <StateCard icon="clock" tone="warn" title="Limite de requisições do GitHub atingido" actions={retry}>Aguarde alguns minutos e tente de novo.</StateCard>;
    case 'unauthorized':
      return <StateCard icon="lock" tone="bad" title="Sua sessão expirou" actions={<button className="primary" onClick={logout}>Entrar de novo</button>}>{message}</StateCard>;
    case 'forbidden':
      return <StateCard icon="lock" tone="bad" title="Sem permissão" actions={retry}>{message}</StateCard>;
    case 'network':
      return <StateCard icon="alert" tone="bad" title="Sem conexão com o servidor" actions={retry}>Verifique se a API do Squak está no ar.</StateCard>;
    case 'upstream':
      return <StateCard icon="alert" tone="bad" title="O GitHub não respondeu direito" actions={retry}>{message}</StateCard>;
    default:
      return <StateCard icon="alert" tone="bad" title="Algo deu errado" actions={retry}>{message}</StateCard>;
  }
}

/**
 * Renderiza um recurso nos seis estados de tela: loading, vazio, erro, sucesso, não autorizado e desconectado.
 * `isEmpty` decide quando mostrar o estado vazio; `empty` descreve o que o usuário deve fazer.
 */
export function Async<T>({ res, reload, isEmpty, empty, rows, children }: {
  res: Resource<T>; reload: () => void; isEmpty?: (d: T) => boolean; empty?: ReactNode; rows?: number; children: (d: T, refreshing: boolean) => ReactNode;
}) {
  if (res.status === 'failed') return <IssueView issue={res.issue} message={res.message} onRetry={reload} />;
  if (res.data === null) return <LoadingBlock rows={rows} />;
  if (isEmpty?.(res.data)) return <>{empty}</>;
  return <>{children(res.data, res.status === 'loading')}</>;
}
