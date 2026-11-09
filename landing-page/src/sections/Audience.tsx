import { Commit } from '../components/Commit'
import { DuckAvatar } from '../components/DuckAvatar'

/** Times: burndown do sprint. */
function Burndown() {
  return (
    <svg className="aud-viz" viewBox="0 0 480 150" aria-hidden="true">
      <path d="M12 16 L468 126" className="burn-ideal" />
      <path d="M12 16 L88 26 L164 32 L240 64 L316 78 L392 104 L440 118" className="burn-real" />
      <circle cx="440" cy="118" r="6" className="burn-dot" />
      <text x="12" y="146" className="burn-k">seg</text>
      <text x="440" y="146" className="burn-k">sex</text>
    </svg>
  )
}

/** Sala de aula: quem contribuiu no projeto do grupo. */
function Roster() {
  const rows: [string, number, 'shades' | 'headset' | 'beanie' | 'cap'][] = [
    ['bia', 38, 'shades'],
    ['leo', 31, 'headset'],
    ['mari', 27, 'cap'],
    ['zé', 0, 'beanie'],
  ]
  return (
    <ul className="roster" aria-hidden="true">
      {rows.map(([n, c, a]) => (
        <li key={n} className={c === 0 ? 'is-zero' : ''}>
          <DuckAvatar accessory={a} size={22} />
          <span className="roster-n">{n}</span>
          <span className="roster-bar">
            <i style={{ width: `${(c / 40) * 100}%` }} />
          </span>
          <span className="roster-c">{c === 0 ? '0 commits · carona?' : `${c} commits`}</span>
        </li>
      ))}
    </ul>
  )
}

/** Hackathon: relógio e placar. */
function Hack() {
  return (
    <div className="hack" aria-hidden="true">
      <span className="hack-clock">
        23<span className="blink">:</span>41<span className="blink">:</span>07
      </span>
      <ol className="hack-board">
        <li>
          <b>1</b> patos.exe <span>4.820</span>
        </li>
        <li>
          <b>2</b> null pointers <span>4.310</span>
        </li>
        <li>
          <b>3</b> grupo do café <span>3.990</span>
        </li>
      </ol>
    </div>
  )
}

/** Open source: grade de contribuições. */
function Grid() {
  const cells = Array.from({ length: 7 * 22 }, (_, i) => {
    const v = (Math.sin(i * 12.9898) * 43758.5453) % 1
    const r = Math.abs(v)
    return r > 0.86 ? 4 : r > 0.66 ? 3 : r > 0.46 ? 2 : r > 0.28 ? 1 : 0
  })
  return (
    <div className="oss" aria-hidden="true">
      {cells.map((l, i) => (
        <i key={i} className={`oss-l${l}`} />
      ))}
    </div>
  )
}

export function Audience() {
  return (
    <section className="sec aud" aria-labelledby="aud-title">
      <div className="wrap">
        <Commit hash="8c3f2d7" msg="feat: para quem" />
        <h2 id="aud-title" className="h2">
          Feito pra quem <span className="nowrap">entrega junto.</span>
        </h2>
        <div className="aud-grid">
          <article className="aud-tile aud-teams">
            <span className="aud-k">times de dev</span>
            <h3 className="h3">Daily curta, sprint que se atualiza sozinho.</h3>
            <p className="body muted">O board acompanha o GitHub. Ninguém mais arrasta card no fim do dia.</p>
            <Burndown />
          </article>
          <article className="aud-tile aud-class">
            <span className="aud-k">sala de aula</span>
            <h3 className="h3">O fim do aluno carona.</h3>
            <p className="body muted">O professor vê quem contribuiu no projeto do grupo, commit por commit.</p>
            <Roster />
          </article>
          <article className="aud-tile aud-hack">
            <span className="aud-k">hackathons</span>
            <h3 className="h3">Times na hora, placar ao vivo.</h3>
            <p className="body muted">E insígnia pra quem parou pra ajudar outro time.</p>
            <Hack />
          </article>
          <article className="aud-tile aud-oss">
            <span className="aud-k">open source</span>
            <h3 className="h3">Contribuição aberta que vira reputação.</h3>
            <p className="body muted">Seu histórico em projetos abertos vai com você, verificado.</p>
            <Grid />
          </article>
        </div>
      </div>
    </section>
  )
}
