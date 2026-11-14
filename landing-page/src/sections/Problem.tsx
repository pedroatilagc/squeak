import { useRef } from 'react'
import { Commit } from '../components/Commit'
import { Window } from '../components/Window'
import { Avatar } from '../components/Avatar'
import { gsap, MQ, useGSAP } from '../lib/motion'

const Sk = ({ w, tone = '' }: { w: number; tone?: string }) => <span className={`sk ${tone}`} style={{ width: `${w}%` }} />

/** Posições do caos e do alinhamento (em % da mesa). */
const WINS = [
  { key: 'chat', chaos: { left: 0, top: 6, rotation: -7 }, grid: { left: 0, top: 0 } },
  { key: 'board', chaos: { left: 40, top: 0, rotation: 5 }, grid: { left: 51, top: 0 } },
  { key: 'repo', chaos: { left: 9, top: 50, rotation: 3 }, grid: { left: 0, top: 52 } },
  { key: 'video', chaos: { left: 47, top: 44, rotation: -4 }, grid: { left: 51, top: 52 } },
]

const NOTIFS = [
  { t: '@você em #geral', n: '37', pos: { left: '22%', top: '2%' } },
  { t: 'PR #41 espera review há 3 dias', pos: { left: '58%', top: '28%' } },
  { t: 'alguém moveu um card', pos: { left: '4%', top: '44%' } },
  { t: 'a reunião começou há 5 min', pos: { left: '50%', top: '86%' } },
  { t: '12 notificações novas', pos: { left: '70%', top: '6%' } },
]

export function Problem() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MQ.story, () => {
        root.current?.classList.add('is-story')
        const wins = gsap.utils.toArray<HTMLElement>('.chaos-win')
        wins.forEach((el, i) => gsap.set(el, { left: `${WINS[i].chaos.left}%`, top: `${WINS[i].chaos.top}%`, rotation: WINS[i].chaos.rotation }))
        gsap.set('.notif', { scale: 0, opacity: 0 })
        gsap.set('.sq-final', { scale: 0.7, opacity: 0, y: 40 })
        gsap.set('.problem-after', { opacity: 0, y: 16 })

        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: 'top top', end: '+=1800', pin: true, scrub: 0.6 },
          defaults: { ease: 'none' },
        })
        tl.to('.notif', { scale: 1, opacity: 1, stagger: 0.12, duration: 0.3, ease: 'back.out(2)' })
          .to(wins, { x: () => gsap.utils.random(-8, 8), duration: 0.15, stagger: 0.03, yoyo: true, repeat: 1 }, '<0.2')
          .addLabel('align', '+=0.15')
          .to('.notif', { opacity: 0, scale: 0.6, duration: 0.25, stagger: 0.04 }, 'align')
          .to(
            wins,
            {
              left: (i: number) => `${WINS[i].grid.left}%`,
              top: (i: number) => `${WINS[i].grid.top}%`,
              rotation: 0,
              x: 0,
              duration: 0.5,
              ease: 'power2.inOut',
            },
            'align',
          )
          .addLabel('collapse', '+=0.15')
          .to(wins, { left: '25%', top: '24%', scale: 0.55, opacity: 0, duration: 0.45, ease: 'power2.in', stagger: 0.04 }, 'collapse')
          .to('.sq-final', { scale: 1, opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 'collapse+=0.25')
          .to('.problem-before', { opacity: 0.35, duration: 0.3 }, 'collapse+=0.25')
          .to('.problem-after', { opacity: 1, y: 0, duration: 0.3 }, '>-0.1')
          .to({}, { duration: 0.25 })
        return () => root.current?.classList.remove('is-story')
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} id="problema" className="sec problem" aria-labelledby="problem-title">
      <div className="wrap problem-grid">
        <div className="problem-copy">
          <Commit hash="7b3d9e1" msg="fix: inferno de abas" />
          <div className="problem-before">
            <h2 id="problem-title" className="h2">
              Quatro ferramentas, zero contexto.
            </h2>
            <p className="lead">E ninguém sabe o que você entregou.</p>
          </div>
          <p className="problem-after lead">
            <span className="hl">Um lugar só.</span> A conversa, a task, o PR e quem entregou, juntos.
          </p>
        </div>

        <div className="problem-desk" role="img" aria-label="Janelas de chat, quadro de tarefas, repositório e videochamada sobrepostas que se organizam e viram uma única janela do Squeak">
          <div className="chaos-win" style={{ left: '0%', top: '6%' }}>
            <Window title="chat — #geral" bar={<span className="pill pill--danger">37</span>}>
              <div className="mock-chat">
                {[70, 45, 85, 55].map((w, i) => (
                  <div className="mock-msg" key={i}>
                    <span className="mock-ava" />
                    <span className="mock-lines">
                      <Sk w={30} tone="sk--strong" />
                      <Sk w={w} />
                    </span>
                  </div>
                ))}
                <div className="mock-msg mock-msg--mention">
                  <span className="mock-ava" />
                  <span className="mock-lines">
                    <span className="mention">@você</span> <Sk w={50} />
                  </span>
                </div>
              </div>
            </Window>
          </div>
          <div className="chaos-win" style={{ left: '40%', top: '0%' }}>
            <Window title="quadro — sprint 12">
              <div className="mock-board">
                {[3, 2, 1].map((n, c) => (
                  <div className="mock-col" key={c}>
                    <Sk w={60} tone="sk--strong" />
                    {Array.from({ length: n }, (_, i) => (
                      <span className="mock-card" key={i}>
                        <Sk w={80} />
                        <Sk w={45} />
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </Window>
          </div>
          <div className="chaos-win" style={{ left: '9%', top: '50%' }}>
            <Window title="repositório — pull requests">
              <div className="mock-prs">
                {[
                  ['aberto', 'pill--ok'],
                  ['review', 'pill--warn'],
                  ['conflito', 'pill--danger'],
                  ['aberto', 'pill--ok'],
                ].map(([s, c], i) => (
                  <div className="mock-pr" key={i}>
                    <span className="mock-pr-icon" />
                    <Sk w={55} />
                    <span className={`pill ${c}`}>{s}</span>
                  </div>
                ))}
              </div>
            </Window>
          </div>
          <div className="chaos-win" style={{ left: '47%', top: '44%' }}>
            <Window title="videochamada" bar={<span className="pill pill--danger">● rec</span>}>
              <div className="mock-video">
                {['AL', 'PC', 'CR', '?'].map((x) => (
                  <span className="mock-tile" key={x}>
                    <span className="mock-initials">{x}</span>
                  </span>
                ))}
              </div>
            </Window>
          </div>

          {NOTIFS.map((n) => (
            <span className="notif" key={n.t} style={n.pos}>
              {n.n && <b>{n.n}</b>} {n.t}
            </span>
          ))}

          <div className="sq-final">
            <Window title="squeak — time-lagoa" accent bar={<span className="pill pill--ok">● call ativa · 3</span>}>
              <div className="sqw">
                <aside className="sqw-side">
                  <span className="sqw-server">lagoa</span>
                  {['geral', 'daily', 'auth', 'deploys'].map((c, i) => (
                    <span key={c} className={`sqw-chan ${i === 2 ? 'is-on' : ''}`}># {c}</span>
                  ))}
                </aside>
                <div className="sqw-main">
                  <div className="sqw-msg">
                    <Avatar who="ana" size={26} />
                    <span>
                      <b>ana</b> aprovou o login. Pode mergear.
                    </span>
                  </div>
                  <div className="sqw-pr">
                    <span className="sqw-pr-state">merged</span>
                    <span>
                      <b>#42</b> feat: login com GitHub
                    </span>
                    <span className="sqw-xp">+120 XP</span>
                  </div>
                  <div className="sqw-kanban">
                    <span>Review</span>
                    <span className="sqw-arrow" aria-hidden="true">→</span>
                    <span className="sqw-done">Done · #42</span>
                  </div>
                </div>
              </div>
            </Window>
          </div>
        </div>
      </div>
    </section>
  )
}
