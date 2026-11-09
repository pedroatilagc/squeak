import { useState } from 'react';
import type { GithubView } from '../../app/context';
import { useResource } from '../../app/useResource';
import { Icon } from '../../design/Icon';
import { Async } from '../../design/states';
import { githubApi } from '../../infra/githubApi';
import { ActivityTimeline } from './ActivityTimeline';
import { ContributionsPanel } from './ContributionGraph';
import { LanguageBar, ProfileHeader, RepoList } from './ProfileView';
import { PullRequestBoard } from './PullRequestBoard';

const TITLES: Record<GithubView, string> = { profile: 'Perfil de desenvolvedor', activity: 'Atividade', prs: 'Pull requests' };
const DAY = 864e5;
const RANGES = [{ id: '30', label: 'Últimos 30 dias', days: 30 }, { id: '90', label: 'Últimos 90 dias', days: 90 }, { id: '365', label: 'Últimos 12 meses', days: 365 }];

function Profile() {
  const [res, reload] = useResource(() => githubApi.profile(), []);
  const [day, setDay] = useState<string | null>(null);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  return (
    <Async res={res} reload={reload} rows={4}>
      {(p) => (
        <div className="gh-profile">
          {p.mock && <div className="callout warn"><Icon name="alert" /> Perfil simulado (modo de desenvolvimento): nada aqui veio do GitHub.</div>}
          <ProfileHeader p={p} />
          <div className="gh-cols">
            <div className="gh-main">
              <ContributionsPanel createdAt={p.created_at} day={day} onDay={setDay} onPeriod={setPeriod} />
              {period && <ActivityTimeline from={period.from} to={period.to} day={day} onClearDay={() => setDay(null)} />}
            </div>
            <aside className="gh-side">
              <section className="panel"><header className="panel-head"><h3>Linguagens</h3></header><LanguageBar p={p} /></section>
              <section className="panel"><header className="panel-head"><h3>Repositórios recentes</h3></header><RepoList p={p} /></section>
            </aside>
          </div>
        </div>
      )}
    </Async>
  );
}

function ActivityOnly() {
  const [rid, setRid] = useState('90');
  const [range] = useState(() => Date.now());
  const r = RANGES.find((x) => x.id === rid)!;
  const to = new Date(range).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const from = new Date(range - r.days * DAY).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const [day, setDay] = useState<string | null>(null);
  return (
    <div className="gh-profile">
      <div className="row start"><label className="inline-label">Período <select value={rid} onChange={(e) => { setRid(e.target.value); setDay(null); }}>{RANGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label></div>
      <ActivityTimeline from={from} to={to} day={day} onClearDay={() => setDay(null)} />
    </div>
  );
}

function MyPrs() {
  const [role, setRole] = useState<'authored' | 'review_requested'>('authored');
  const [res, reload] = useResource(() => githubApi.pullRequests(role), [role]);
  return (
    <div className="gh-profile">
      <div className="seg" role="tablist" aria-label="Escopo">
        <button role="tab" aria-selected={role === 'authored'} className={role === 'authored' ? 'on' : 'ghost'} onClick={() => setRole('authored')}>Criados por mim</button>
        <button role="tab" aria-selected={role === 'review_requested'} className={role === 'review_requested' ? 'on' : 'ghost'} onClick={() => setRole('review_requested')}>Revisão solicitada a mim</button>
      </div>
      <Async res={res} reload={reload} rows={4}>
        {(d) => (
          <>
            {d.mock && <div className="callout warn"><Icon name="alert" /> Dados simulados (modo de desenvolvimento).</div>}
            <PullRequestBoard key={role} items={d.items} emptyHint={role === 'authored' ? 'Você não tem pull requests recentes.' : 'Ninguém pediu sua revisão agora.'} />
          </>
        )}
      </Async>
    </div>
  );
}

export function GithubArea({ view }: { view: GithubView }) {
  return (
    <div className="area">
      <header className="area-head"><Icon name="branch" size={18} /><h2>GitHub · {TITLES[view]}</h2></header>
      <div className="area-body">{view === 'profile' ? <Profile /> : view === 'activity' ? <ActivityOnly /> : <MyPrs />}</div>
    </div>
  );
}
