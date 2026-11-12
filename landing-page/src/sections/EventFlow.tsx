import { useRef } from 'react'
import { Commit } from '../components/Commit'
import { Badge } from '../components/Badge'
import { Avatar } from '../components/Avatar'
import { gsap, MQ, useGSAP } from '../lib/motion'

/**
 * O conceito central: um evento nasce e viaja por trilhos até Feed, Kanban e XP.
 * A espinha do git abre uma branch aqui e faz merge no fim da seção.
 */
export function EventFlow() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      // A branch lateral se desenha com o scroll em qualquer tela com movimento.
      mm.add(MQ.motion, () => {
        const path = root.current?.querySelector<SVGPathElement>('.branch-path')
        if (path) {
          const len = path.getTotalLength()
          gsap.set(path, { strokeDasharray: len, strokeDashoffset: len })
          gsap.to(path, {
            strokeDashoffset: 0,
            ease: 'none',
            scrollTrigger: { trigger: root.current, start: 'top 70%', end: 'bottom 60%', scrub: true },
          })
        }
      })

      mm.add(MQ.story, () => {
        root.current?.classList.add('is-story')
        const rails = gsap.utils.toArray<SVGPathElement>('.rail-path')
        rails.forEach((r) => {
          const len = r.getTotalLength()
          gsap.set(r, { strokeDasharray: len, strokeDashoffset: len })
        })
        gsap.set('.pulse', { opacity: 0 })
        gsap.set('.flow-feed-new', { opacity: 0, y: -14, height: 0 })
        gsap.set('.flow-kcard', { x: 0 })
        gsap.set('.flow-xpfill', { scaleX: 0.42 })
        gsap.set('.flow-unlock', { scale: 0, opacity: 0 })
        gsap.set('.flow-source', { opacity: 0.4 })

        const tl = gsap.timeline({
          scrollTrigger: { trigger: '.flow-stage', start: 'top 18%', end: '+=1500', pin: root.current, scrub: 0.7 },
          defaults: { ease: 'none' },
        })
        tl.to('.flow-source', { opacity: 1, duration: 0.2 })
          .to('.flow-chip', { scale: 1.06, duration: 0.08, yoyo: true, repeat: 1 })
          .addLabel('go')
        rails.forEach((r, i) => {
          tl.to(r, { strokeDashoffset: 0, duration: 0.6, ease: 'power1.inOut' }, `go+=${i * 0.08}`)
          tl.to(`.pulse-${i}`, { opacity: 1, duration: 0.05 }, `go+=${i * 0.08}`)
          tl.to(
            `.pulse-${i}`,
            { motionPath: { path: r, align: r, alignOrigin: [0.5, 0.5] }, duration: 0.6, ease: 'power1.inOut' },
            `go+=${i * 0.08}`,
          )
          tl.to(`.pulse-${i}`, { opacity: 0, duration: 0.05 }, '>')
        })
        tl.addLabel('land')
          .to('.flow-feed-new', { opacity: 1, y: 0, height: 'auto', duration: 0.3, ease: 'power2.out' }, 'land-=0.15')
          .to('.flow-kcard', { x: () => (root.current?.querySelector('.flow-kcol--done') as HTMLElement)?.offsetLeft ?? 0, duration: 0.35, ease: 'power2.inOut' }, 'land-=0.05')
          .to('.flow-kcard', { className: 'flow-kcard is-done' }, '>')
          .to('.flow-xpfill', { scaleX: 0.84, duration: 0.35, ease: 'power2.out' }, 'land')
          .to('.flow-unlock', { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2.2)' }, '>-0.05')
          .to({}, { duration: 0.3 })
        return () => root.current?.classList.remove('is-story')
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} className="sec flow" aria-labelledby="flow-title">
      <svg className="branch" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 40 1000">
        <path className="branch-base" d="M2 0 C 2 40, 30 40, 30 90 L 30 910 C 30 960, 2 960, 2 1000" />
        <path className="branch-path" d="M2 0 C 2 40, 30 40, 30 90 L 30 910 C 30 960, 2 960, 2 1000" />
      </svg>
      <span className="branch-label" aria-hidden="true">
        feat/event-bus
      </span>

      <div className="wrap">
        <Commit hash="c41d8b2" msg="feat: tudo é um evento" />
        <h2 id="flow-title" className="h2">
          Tudo é um evento.
        </h2>
        <p className="lead flow-lead">
          PR aberto, issue movida, call iniciada. Cada evento alimenta o feed, o kanban e o XP ao mesmo tempo, e ninguém
          precisa atualizar nada na mão.
        </p>

        <div className="flow-stage">
          <div className="flow-source">
            <div className="flow-term">
              <span className="pv-muted">~/lagoa</span> <span className="flow-prompt">$</span> gh pr merge 42
              <br />
              <span className="flow-ok">✓</span> Merged pull request #42
            </div>
            <span className="flow-chip">
              <span className="flow-chip-k">event</span> pull_request.merged
            </span>
          </div>

          <svg className="flow-rails" viewBox="0 0 400 420" preserveAspectRatio="none" aria-hidden="true">
            <path className="rail-base" d="M0 210 C 160 210, 200 60, 400 60" />
            <path className="rail-base" d="M0 210 L 400 210" />
            <path className="rail-base" d="M0 210 C 160 210, 200 360, 400 360" />
            <path className="rail-path" d="M0 210 C 160 210, 200 60, 400 60" />
            <path className="rail-path" d="M0 210 L 400 210" />
            <path className="rail-path" d="M0 210 C 160 210, 200 360, 400 360" />
          </svg>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`pulse pulse-${i}`} aria-hidden="true" />
          ))}

          <div className="flow-dests">
            <div className="flow-dest">
              <span className="flow-dest-k">feed</span>
              <ul className="flow-feed">
                <li className="flow-feed-new">
                  <Avatar who="pedro" size={20} /> <b>pedro</b> mergeou <b>#42</b> · login com GitHub
                </li>
                <li>
                  <Avatar who="ana" size={20} /> <b>ana</b> aprovou <b>#42</b>
                </li>
                <li>
                  <Avatar who="caio" size={20} /> <b>caio</b> abriu <b>#51</b>
                </li>
              </ul>
            </div>
            <div className="flow-dest">
              <span className="flow-dest-k">kanban</span>
              <div className="flow-kanban">
                <span className="flow-kcol">Review</span>
                <span className="flow-kcol flow-kcol--done">Done</span>
                <span className="flow-kcard">
                  <b>#42</b> Login com GitHub
                </span>
              </div>
            </div>
            <div className="flow-dest">
              <span className="flow-dest-k">xp</span>
              <div className="flow-xp">
                <span className="flow-xpbar">
                  <i className="flow-xpfill" />
                </span>
                <span className="flow-xptext">
                  <b>+120 XP</b> · PR mergeado
                </span>
                <span className="flow-unlock">
                  <Badge tier="silver" glyph="merge" size={44} />
                  <span>
                    <b>Merge Machine II</b>
                    <small>desbloqueada</small>
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="flow-future">
          <span className="flow-future-dash" aria-hidden="true" />
          Em breve, os mesmos eventos movem os patinhos do escritório virtual.
        </p>
      </div>
    </section>
  )
}
