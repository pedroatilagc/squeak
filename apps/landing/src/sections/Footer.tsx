const LINKS: [string, string][] = [
  ['squeak --docs', 'documentação (em breve)'],
  ['squeak --github', 'código e roadmap'],
  ['squeak --brand', 'identidade visual'],
  ['squeak --waitlist', 'lista de espera'],
]

export function Footer() {
  return (
    <footer className="foot wrap">
      <p className="commit foot-head is-reached" aria-hidden="true">
        <span className="commit-dot" />
        <span className="commit-hash">HEAD → main</span>
        <span className="commit-msg">você está aqui</span>
      </p>
      <div className="foot-term">
        <p className="foot-cmd">
          <span className="pv-muted">~</span> <span className="flow-prompt">$</span> squeak --help
        </p>
        <ul className="foot-links">
          {LINKS.map(([cmd, desc]) => (
            <li key={cmd}>
              <a href="#conteudo">{cmd}</a>
              <span className="foot-desc">{desc}</span>
            </li>
          ))}
        </ul>
        <p className="foot-meta">
          v0.1.0-alpha · protótipo de identidade visual · nenhum pato foi ferido no debugging
        </p>
      </div>
    </footer>
  )
}
