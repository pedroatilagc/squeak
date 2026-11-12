import { useState } from 'react';
import { useApp } from '../../app/context';
import { useResource } from '../../app/useResource';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../design/Icon';
import { Async, StateCard } from '../../design/states';
import type { Integration } from '../../domain/github';
import { githubApi, integrationsApi } from '../../infra/githubApi';
import { openUrl } from '../../native';
import { ConnectGithub } from '../github/ConnectGithub';

const STATUS: Record<Integration['status'], { label: string; tone: string }> = {
  connected: { label: 'Conectado', tone: 'ok' }, disconnected: { label: 'Desconectado', tone: '' },
  unconfigured: { label: 'Pendente de configuração', tone: 'warn' }, reauth_required: { label: 'Reautorização necessária', tone: 'warn' }, planned: { label: 'Planejado', tone: 'info' },
};

function GithubCard({ it, reload }: { it: Integration; reload: () => void }) {
  const { go } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const disconnect = async () => {
    setBusy(true); setErr('');
    try { await githubApi.disconnect(); setConfirm(false); reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="int-card">
      <header>
        <span className="int-logo"><Icon name="branch" size={20} /></span>
        <div className="grow"><h3>{it.name}</h3><p className="muted small">Perfil, contribuições, atividade e pull requests</p></div>
        <span className={'chip ' + STATUS[it.status].tone}>{STATUS[it.status].label}</span>
      </header>
      {it.mock && <div className="callout warn"><Icon name="alert" /> Modo de desenvolvimento: os dados são simulados (GITHUB_MOCK=1). Nada vem do GitHub de verdade.</div>}

      {it.status === 'unconfigured' && (
        <div className="callout warn"><Icon name="plug" /><span>Faltam as credenciais da GitHub App no servidor. Passo a passo em <span className="mono">docs/GITHUB_INTEGRATION.md</span>.
          Nenhuma integração real foi concluída enquanto isso não for feito.</span></div>
      )}
      {(it.status === 'disconnected' || it.status === 'reauth_required') && <ConnectGithub reauth={it.status === 'reauth_required'} onConnected={reload} />}
      {it.status === 'connected' && it.account && (
        <div className="int-account">
          <Avatar name={it.account.login} url={it.account.avatar_url} size={36} />
          <div className="grow"><b>@{it.account.login}</b><div className="muted small">Autorizado como usuário da GitHub App</div></div>
          <button onClick={() => go('github', { githubView: 'profile' })}>Abrir perfil</button>
          {it.install_url && <button onClick={() => void openUrl(it.install_url!)}><Icon name="external" /> Instalar a GitHub App</button>}
          {confirm
            ? <><button className="danger" disabled={busy} onClick={disconnect}>{busy ? 'Desconectando…' : 'Confirmar'}</button><button className="ghost" onClick={() => setConfirm(false)}>Cancelar</button></>
            : <button className="ghost danger" onClick={() => setConfirm(true)}><Icon name="unlink" /> Desconectar</button>}
        </div>
      )}
      {err && <div className="callout bad" role="alert"><Icon name="alert" /> {err}</div>}

      <ul className="int-notes">
        <li><Icon name="lock" size={13} /> Os tokens ficam cifrados no servidor. O app desktop nunca os vê.</li>
        <li><Icon name="shield" size={13} /> Permissões mínimas. {it.permissions_note}</li>
        <li><Icon name="unlink" size={13} /> Desconectar revoga a autorização no GitHub e apaga os tokens.</li>
      </ul>
    </section>
  );
}

function PlannedCard({ it }: { it: Integration }) {
  return (
    <section className="int-card planned">
      <header>
        <span className="int-logo"><Icon name="bolt" size={20} /></span>
        <div className="grow"><h3>{it.name}</h3><p className="muted small">Projetos, issues, responsáveis, status e prioridades</p></div>
        <span className="chip info">{STATUS.planned.label}</span>
      </header>
      <p className="muted small">{it.permissions_note}. A arquitetura e os contratos já existem (<span className="mono">docs/INTEGRATIONS.md</span>); a conexão será adicionada em uma próxima etapa.</p>
    </section>
  );
}

export function IntegrationsArea() {
  const [res, reload] = useResource(() => integrationsApi.list(), []);
  return (
    <div className="area">
      <header className="area-head"><h2>Integrações</h2><span className="muted small">Conexões pessoais com serviços externos</span></header>
      <div className="area-body">
        <Async res={res} reload={reload} isEmpty={(d) => d.length === 0}
          empty={<StateCard icon="plug" title="Nenhuma integração disponível">O servidor não listou integrações.</StateCard>}>
          {(items) => <div className="int-grid">{items.map((it) => it.provider === 'github' ? <GithubCard key={it.provider} it={it} reload={reload} /> : <PlannedCard key={it.provider} it={it} />)}</div>}
        </Async>
      </div>
    </div>
  );
}
