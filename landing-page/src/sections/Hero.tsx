import { useEffect, useState } from 'react'
import { Commit } from '../components/Commit'
import { waitlistToast } from '../components/StatusBar'
import { DuckAvatar, type Accessory } from '../components/DuckAvatar'
import { useReducedMotion } from '../lib/motion'
import { PixelSqueak } from '../mascot/pixel/PixelSqueak'

type Ev = { who: string; acc: Accessory; text: React.ReactNode; xp?: string }

const EVENTS: Ev[] = [
  { who: 'pedro', acc: 'headset', text: <>abriu <b>PR #42</b> · <code>feat/login</code></> },
  { who: 'ana', acc: 'shades', text: <>revisou e pediu 2 mudanças em <b>#42</b></> },
  { who: 'pedro', acc: 'headset', text: <>aplicou as mudanças · <code>3 commits</code></> },
  { who: 'ana', acc: 'shades', text: <>aprovou <b>#42</b></> },
  { who: 'squeak', acc: 'none', text: <><b>#42</b> mergeado · card foi pra <b>Done</b></>, xp: '+120 XP' },
  { who: 'squeak', acc: 'none', text: <>Merge Machine <b>II</b> desbloqueada</>, xp: 'insígnia' },
  { who: 'caio', acc: 'beanie', text: <>moveu <b>#51</b> pra <b>Em andamento</b></> },
  { who: 'lu', acc: 'cap', text: <>iniciou call em <b>#daily</b> · 3 pessoas</> },
  { who: 'ana', acc: 'shades', text: <>ajudou caio a destravar <b>#51</b></>, xp: '+50 XP' },
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
              <span className="feed-sys" aria-hidden="true">◆</span>
            ) : (
              <DuckAvatar accessory={ev.acc} size={22} />
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

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-stage">
        <PixelSqueak maxScale={5} />
      </div>

      <header className="hero-top wrap">
        <span className="wordmark">
          <DuckAvatar size={28} /> squeak
        </span>
        <span className="hero-version">v0.1.0-alpha · lista de espera aberta</span>
      </header>

      <div className="hero-copy wrap">
        <Commit hash="e1f0a2c" msg="init: seu time num lugar só" />
        <h1 id="hero-title" className="hero-title">
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
