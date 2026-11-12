import { useEffect } from 'react';
import { useApp } from '../../app/context';
import { useResource } from '../../app/useResource';
import { Icon } from '../../design/Icon';
import { Async } from '../../design/states';
import { workspaceGithubApi } from '../../infra/githubApi';
import { PullRequestBoard } from '../github/PullRequestBoard';

/** PRs do workspace, montados só com o que chegou por webhook dos repositórios conectados. */
export function TeamPullRequests({ serverId, onManageRepos }: { serverId: string; onManageRepos: () => void }) {
  const { rt, isAdmin } = useApp();
  const [res, reload] = useResource(() => workspaceGithubApi.pullRequests(serverId), [serverId]);
  useEffect(() => rt?.on((e) => { if ((e.type === 'github.pr_updated' && e.server_id === serverId) || e.type === 'resync') reload(); }), [rt, serverId, reload]);
  return (
    <div className="area">
      <header className="area-head">
        <Icon name="pr" size={18} /><h2>Pull requests</h2><span className="grow" />
        <button className="ghost" onClick={reload} aria-label="Atualizar"><Icon name="refresh" /></button>
        {isAdmin && <button onClick={onManageRepos}><Icon name="repo" /> Repositórios conectados</button>}
      </header>
      <div className="area-body">
        <Async res={res} reload={reload} rows={4}>
          {(d) => <PullRequestBoard items={d.items} emptyHint={isAdmin
            ? 'Conecte repositórios a este workspace. Os PRs aparecem aqui a partir dos próximos eventos recebidos pelo webhook.'
            : 'Quando um admin conectar repositórios, os PRs aparecem aqui conforme os eventos chegam.'} />}
        </Async>
      </div>
    </div>
  );
}
