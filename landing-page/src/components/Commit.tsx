type Props = { hash: string; msg: string; className?: string }

/** Rótulo de seção = commit no grafo. A bolinha se encaixa na espinha da página. */
export function Commit({ hash, msg, className = '' }: Props) {
  return (
    <p className={`commit ${className}`} data-commit>
      <span className="commit-dot" aria-hidden="true" />
      <span className="commit-hash">{hash}</span>
      <span className="commit-msg">{msg}</span>
    </p>
  )
}
