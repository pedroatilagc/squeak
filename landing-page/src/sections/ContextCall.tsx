import { useRef } from 'react'
import { Commit } from '../components/Commit'
import { DuckAvatar, type Accessory } from '../components/DuckAvatar'
import { gsap, MQ, useGSAP } from '../lib/motion'

type P = { name: string; acc: Accessory; task: string; branch: string; issue: string; state: 'ok' | 'warn'; speaking?: boolean; status: string }

const PEOPLE: P[] = [
  { name: 'pedro', acc: 'headset', task: 'Login com GitHub', branch: 'feat/login', issue: '#42', state: 'ok', status: 'mergeado ontem', speaking: true },
  { name: 'ana', acc: 'shades', task: 'Review do fluxo de auth', branch: 'review/auth', issue: '#38', state: 'ok', status: '2 reviews hoje' },
  { name: 'caio', acc: 'beanie', task: 'Bug no upload de avatar', branch: 'fix/avatar-upload', issue: '#51', state: 'warn', status: 'travado: precisa de ajuda' },
]

export function ContextCall() {
  const root = useRef<HTMLElement>(null)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        gsap.from('.call-tile', {
          y: 40,
          opacity: 0,
          stagger: 0.12,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: '.call', start: 'top 75%' },
        })
        gsap.from('.call-ctx', {
          y: -12,
          opacity: 0,
          stagger: 0.12,
          duration: 0.6,
          delay: 0.45,
          ease: 'power2.out',
          scrollTrigger: { trigger: '.call', start: 'top 75%' },
        })
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} className="sec ctxcall" aria-labelledby="call-title">
      <div className="wrap ctxcall-grid">
        <div className="ctxcall-copy">
          <Commit hash="5e0a7f3" msg="feat: call com contexto" />
          <h2 id="call-title" className="h2">
            Call com contexto.
          </h2>
          <p className="lead">
            Na daily, cada um mostra o que fez. Sem “deixa eu lembrar o que fiz ontem”.
          </p>
          <p className="body muted">
            Quando você entra numa call, o seu card aparece com a task atual, a branch e as issues. A conversa começa no
            assunto, e quem está travado fica visível sem precisar levantar a mão.
          </p>
        </div>

        <div className="call" role="img" aria-label="Call com três participantes; sob cada um, um card com task, branch e issue atuais">
          <div className="call-top">
            <span className="call-room"># daily</span>
            <span className="call-time">09:30 · 04:12</span>
          </div>
          <div className="call-tiles">
            {PEOPLE.map((p) => (
              <div key={p.name} className="call-person">
                <div className={`call-tile ${p.speaking ? 'is-speaking' : ''}`}>
                  <DuckAvatar accessory={p.acc} size={88} mood={p.speaking ? 'happy' : 'calm'} />
                  <span className="call-name">{p.name}</span>
                  {p.speaking && <span className="call-wave" aria-hidden="true"><i /><i /><i /></span>}
                </div>
                <div className={`call-ctx call-ctx--${p.state}`}>
                  <span className="call-ctx-task">{p.task}</span>
                  <span className="call-ctx-row">
                    <span className="call-branch">⎇ {p.branch}</span>
                    <span className="call-issue">{p.issue}</span>
                  </span>
                  <span className="call-ctx-status">{p.status}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="call-controls" aria-hidden="true">
            <span>mic</span>
            <span>câmera</span>
            <span className="is-on">tela</span>
            <span className="call-leave">sair</span>
          </div>
        </div>
      </div>
    </section>
  )
}
