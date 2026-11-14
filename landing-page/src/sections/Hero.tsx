import { useEffect, useRef, useState } from 'react'
import { Commit } from '../components/Commit'
import { waitlistToast } from '../components/StatusBar'
import { Avatar, type Person } from '../components/Avatar'
import { Wordmark } from '../components/Wordmark'
import { useReducedMotion } from '../lib/motion'
import { PixelSqueak, type PixelSqueakHandle } from '../mascot/pixel/PixelSqueak'
import { afterBoot } from './Boot'

type Ev = { who: Person | 'squeak'; text: React.ReactNode; xp?: string }

const EVENTS: Ev[] = [
  { who: 'pedro', text: <>abriu <b>PR #42</b> · <code>feat/login</code></> },
  { who: 'ana', text: <>revisou e pediu 2 mudanças em <b>#42</b></> },
  { who: 'pedro', text: <>aplicou as mudanças · <code>3 commits</code></> },
  { who: 'ana', text: <>aprovou <b>#42</b></> },
  { who: 'squeak', text: <><b>#42</b> mergeado · card foi pra <b>Done</b></>, xp: '+120 XP' },
  { who: 'squeak', text: <>Merge Machine <b>II</b> desbloqueada</>, xp: 'insígnia' },
  { who: 'caio', text: <>moveu <b>#51</b> pra <b>Em andamento</b></> },
  { who: 'lu', text: <>iniciou call em <b>#daily</b> · 3 pessoas</> },
  { who: 'ana', text: <>ajudou caio a destravar <b>#51</b></>, xp: '+50 XP' },
]

function EventFeed() {
  const reduced = useReducedMotion()
  const [head, setHead] = useState(4)
  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => setHead((h) => h + 1), 2300)
    return () => clearInterval(id)
  }, [reduced])
  const items = Array.from({ length: 5 }, (_, i) => {
    const n = head - i
    return { key: n, ev: EVENTS[((n % EVENTS.length) + EVENTS.length) % EVENTS.length] }
  })
  return (
    <div className="feed" aria-label="Exemplo de feed de eventos do time">
      <div className="feed-head">
        <span className="feed-live" aria-hidden="true" /> squeak events --follow
      </div>
      <ol className="feed-list">
        {items.map(({ key, ev }, i) => (
          <li key={key} className="feed-item" style={{ opacity: 1 - i * 0.17 }}>
            {ev.who === 'squeak' ? (
              <img className="feed-sys" src="/brand/squeak-logo-256.webp" alt="" width={22} height={20} />
            ) : (
              <Avatar who={ev.who} size={22} />
            )}
            <span className="feed-text">
              <span className="feed-who">{ev.who}</span> {ev.text}
            </span>
            {ev.xp && <span className="feed-xp">{ev.xp}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ── <squeak/>: o nome digitado como um componente que se fecha sozinho ── */

const SEQ = 'squeak'

function SqueakTag({ start, onDone, onPoke }: { start: boolean; onDone: () => void; onPoke: () => void }) {
  const reduced = useReducedMotion()
  const [n, setN] = useState(reduced ? SEQ.length : 0)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (!start) return
    if (reduced) {
      setN(SEQ.length)
      done.current()
      return
    }
    setN(0)
    const timers: number[] = []
    let t = 420
    for (let i = 1; i <= SEQ.length; i++) {
      // digitação humana: letras com ritmo irregular, uma pausa antes de fechar a tag
      t += 80 + Math.random() * 90
      timers.push(window.setTimeout(() => setN(i), t))
    }
    timers.push(window.setTimeout(() => done.current(), t + 140))
    return () => timers.forEach(clearTimeout)
  }, [start, reduced])

  const closed = n >= SEQ.length
  return (
    <p className={`tag ${closed ? 'is-closed' : ''}`} aria-hidden="true" onClick={onPoke}>
      <span className="tag-text">{SEQ.slice(0, n)}</span>
      <span className="tag-caret" />
    </p>
  )
}

export function Hero() {
  const [ready, setReady] = useState(false)
  const duck = useRef<PixelSqueakHandle>(null)

  useEffect(() => afterBoot(() => setReady(true)), [])

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-stage">
        <PixelSqueak ref={duck} maxScale={5} />
      </div>

      <header className="hero-top wrap">
        <Wordmark />
        <span className="hero-version">v0.1.0-alpha · lista de espera aberta</span>
      </header>

      <div className="hero-copy wrap">
        <Commit hash="e1f0a2c" msg="init: seu time num lugar só" />
        <SqueakTag start={ready} onDone={() => {}} onPoke={() => duck.current?.poke()} />
        <h1 id="hero-title" className="hero-title">
          <span className="sr-only">Squeak: </span>
          Seu time inteiro <span className="nowrap">num lugar só.</span>
        </h1>
        <p className="hero-lead">
          Chat, calls, kanban e GitHub conectados. E cada contribuição vira reputação.
        </p>
        <div className="hero-ctas">
          <button type="button" className="btn btn--primary" onClick={waitlistToast}>
            Entrar na lista de espera
          </button>
          <a className="btn btn--ghost" href="#problema">
            Ver como funciona <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="hero-hint">psst: clique no pato.</p>
      </div>

      <div className="hero-feed wrap">
        <EventFeed />
      </div>
    </section>
  )
}
