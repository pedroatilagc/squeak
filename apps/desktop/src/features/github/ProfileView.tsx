import { Avatar } from '../../components/Avatar';
import { Icon } from '../../design/Icon';
import type { GithubProfile } from '../../domain/github';
import { openUrl } from '../../native';
import { relTime } from './PullRequestBoard';

export function ProfileHeader({ p }: { p: GithubProfile }) {
  return (
    <section className="gh-hero">
      <Avatar name={p.login} url={p.avatar_url} size={88} />
      <div className="grow">
        <h2>{p.name ?? p.login}</h2>
        <div className="muted">@{p.login}</div>
        {p.bio && <p className="bio">{p.bio}</p>}
        <div className="gh-facts">
          {p.company && <span><Icon name="users" size={13} /> {p.company}</span>}
          {p.location && <span>{p.location}</span>}
          <span>{p.followers} seguidores · {p.following} seguindo</span>
          <span>{p.public_repos} repositórios públicos</span>
          <span>no GitHub desde {new Date(p.created_at).getFullYear()}</span>
        </div>
      </div>
      <button onClick={() => void openUrl(p.html_url)}><Icon name="external" /> Ver no GitHub</button>
    </section>
  );
}

export function LanguageBar({ p }: { p: GithubProfile }) {
  if (p.languages.length === 0) return <p className="muted small">Sem linguagens detectadas nos repositórios recentes.</p>;
  return (
    <div>
      <div className="lang-bar" role="img" aria-label={p.languages.map((l) => `${l.name} ${l.percent.toFixed(0)}%`).join(', ')}>
        {p.languages.map((l) => <i key={l.name} style={{ width: `${l.percent}%`, background: l.color ?? 'var(--fg-3)' }} />)}
      </div>
      <ul className="lang-list">
        {p.languages.map((l) => <li key={l.name}><i style={{ background: l.color ?? 'var(--fg-3)' }} /> {l.name} <span className="dim">{l.percent.toFixed(1)}%</span></li>)}
      </ul>
    </div>
  );
}

export function RepoList({ p }: { p: GithubProfile }) {
  if (p.repositories.length === 0) return <p className="muted small">Nenhum repositório próprio recente.</p>;
  return (
    <div className="repo-grid">
      {p.repositories.map((r) => (
        <button key={r.name_with_owner} className="repo-card" onClick={() => void openUrl(r.url)}>
          <div className="repo-name"><Icon name={r.is_private ? 'lock' : 'repo'} size={14} /> <span className="ellip">{r.name_with_owner}</span></div>
          <p className="muted small repo-desc">{r.description ?? 'Sem descrição'}</p>
          <div className="repo-foot dim small">
            {r.primary_language && <span><i className="dot" style={{ background: r.primary_language.color ?? 'var(--fg-3)' }} /> {r.primary_language.name}</span>}
            <span><Icon name="star" size={12} /> {r.stars}</span><span>{r.forks} forks</span><span>push {relTime(r.pushed_at)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
