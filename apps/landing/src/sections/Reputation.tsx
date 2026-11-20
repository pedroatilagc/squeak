import { useRef, useState } from 'react'
import { Commit } from '../components/Commit'
import { Badge } from '../components/Badge'
import { Avatar } from '../components/Avatar'
import { pushToast } from '../lib/app'
import { squeak } from '../lib/sound'
import { useReducedMotion } from '../lib/motion'

/* ── Card do dev com tilt e reflexo holográfico ─────────────────── */
function DevCard() {
  const card = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  const onMove = (e: React.PointerEvent) => {
    if (reduced || !card.current) return
    const r = card.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    card.current.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    card.current.style.setProperty('--ry', `${(x - 0.5) * 18}deg`)
    card.current.style.setProperty('--mx', `${x * 100}%`)
    card.current.style.setProperty('--my', `${y * 100}%`)
  }
  const onLeave = () => {
    card.current?.style.setProperty('--rx', '0deg')
    card.current?.style.setProperty('--ry', '0deg')
  }

  return (
    <div className="devcard-wrap" onPointerMove={onMove} onPointerLeave={onLeave}>
      <div ref={card} className="devcard" aria-label="Exemplo de card do dev: ana.dev, level 23" role="img">
        <div className="devcard-holo" aria-hidden="true" />
        <div className="devcard-top">
          <span className="devcard-season">temporada 3 · #4</span>
          <span className="devcard-lvl">
            <small>lvl</small>23
          </span>
        </div>
        <div className="devcard-id">
          <span className="devcard-ava">
            <Avatar who="ana" size={84} />
          </span>
          <b className="devcard-name">ana.dev</b>
          <span className="devcard-stack">Go · Postgres · Kubernetes</span>
        </div>
        <div className="devcard-badges">
          <Badge tier="gold" glyph="eye" size={50} />
          <Badge tier="silver" glyph="merge" size={50} />
          <Badge tier="bronze" glyph="mentor" size={50} />
        </div>
        <ul className="devcard-log">
          <li>
            <span className="devcard-ok">✓</span> mergeou <b>#42</b> · auth
          </li>
          <li>
            <span className="devcard-ok">✓</span> review que mudou <b>#38</b>
          </li>
          <li>
            <span className="devcard-ok">✓</span> resolveu <b>#51</b> · crítico
          </li>
        </ul>
        <div className="devcard-foot">
          <span>412 contribuições verificadas</span>
          <span className="devcard-sig">squeak.dev/ana</span>
        </div>
      </div>
    </div>
  )
}

/* ── Simulador de XP: o elemento interativo da página ──────────── */
type Action = { label: string; xp: number; why: string }
const ACTIONS: Action[] = [
  { label: 'Abrir um PR', xp: 30, why: 'entrega em andamento' },
  { label: 'Review que gerou mudança', xp: 60, why: 'review de verdade' },
  { label: 'Resolver bug crítico', xp: 150, why: 'apagou incêndio' },
  { label: 'Destravar um colega', xp: 50, why: 'ajudar conta' },
  { label: 'Mandar 100 mensagens', xp: 0, why: 'volume não é entrega' },
  { label: 'Ficar 8h online', xp: 0, why: 'presença não é entrega' },
  { label: 'Escrever 2.000 linhas', xp: 0, why: 'linha não é valor' },
]
const PER_LEVEL = 300

function XpSimulator() {
  const [xp, setXp] = useState(0)
  const [log, setLog] = useState<{ id: number; a: Action }[]>([])
  const [shake, setShake] = useState<number | null>(null)
  const idRef = useRef(0)

  const level = Math.floor(xp / PER_LEVEL) + 1
  const pct = ((xp % PER_LEVEL) / PER_LEVEL) * 100

  const act = (a: Action, i: number) => {
    const id = ++idRef.current
    setLog((l) => [{ id, a }, ...l].slice(0, 4))
    if (a.xp === 0) {
      setShake(i)
      window.setTimeout(() => setShake(null), 420)
      return
    }
    const next = xp + a.xp
    if (Math.floor(next / PER_LEVEL) > Math.floor(xp / PER_LEVEL)) {
      squeak(1.4)
      pushToast({ kind: 'xp', title: `Level up! Agora você é level ${Math.floor(next / PER_LEVEL) + 1}.`, detail: 'Só com entrega de verdade.' })
    }
    setXp(next)
  }

  return (
    <div className="sim">
      <div className="sim-head">
        <span className="sim-title">simulador de xp</span>
        <button type="button" className="sim-reset" onClick={() => (setXp(0), setLog([]))}>
          zerar
        </button>
      </div>
      <div className="sim-meter" aria-live="polite">
        <span className="sim-level">
          <small>level</small>
          {level}
        </span>
        <span className="sim-bar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="sim-xp">{xp} XP</span>
      </div>
      <div className="sim-actions">
        {ACTIONS.map((a, i) => (
          <button
            key={a.label}
            type="button"
            className={`sim-btn ${a.xp === 0 ? 'sim-btn--zero' : ''} ${shake === i ? 'is-shaking' : ''}`}
            onClick={() => act(a, i)}
          >
            <span>{a.label}</span>
            <span className="sim-btn-xp">{a.xp ? `+${a.xp}` : '0'}</span>
          </button>
        ))}
      </div>
      <ol className="sim-log" aria-live="polite" aria-label="Últimas ações">
        {log.length === 0 && <li className="sim-log-empty">Clique numa ação e veja o que conta.</li>}
        {log.map(({ id, a }) => (
          <li key={id} className={a.xp ? 'is-xp' : 'is-zero'}>
            {a.xp ? (
              <>
                <b>+{a.xp} XP</b> · {a.why}
              </>
            ) : (
              <>
                <b>0 XP</b> · aqui não conta. {a.why}.
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function Reputation() {
  return (
    <section className="sec rep" aria-labelledby="rep-title">
      <div className="wrap">
        <Commit hash="9d2c6b8" msg="feat: card do dev + xp de qualidade" />
        <h2 id="rep-title" className="h2 rep-title">
          O card do dev.
        </h2>
        <p className="lead rep-lead">
          Um currículo vivo, feito de contribuições que dá pra verificar. Entregou? Contou.
        </p>
        <div className="rep-grid">
          <DevCard />
          <div className="rep-sim">
            <h3 className="h3">XP de qualidade, não de volume.</h3>
            <p className="body muted">
              Conta PR mergeado, review que gerou mudança, issue resolvida, ajudar alguém. Não conta linha de código,
              mensagem nem tempo online. Teste:
            </p>
            <XpSimulator />
          </div>
        </div>
      </div>
    </section>
  )
}
