import { useRef } from 'react'
import { gsap, ScrollTrigger, useGSAP } from '../lib/motion'

/**
 * A linha `git log --graph` que atravessa a página.
 * Ela se desenha com o scroll; cada commit acende quando a linha chega nele.
 */
export function GitSpine() {
  const fill = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    const page = document.querySelector('.page')
    if (!page || !fill.current) return
    gsap.set(fill.current, { scaleY: 0 })
    ScrollTrigger.create({
      trigger: page,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => gsap.set(fill.current, { scaleY: self.progress }),
    })
    gsap.utils.toArray<HTMLElement>('[data-commit]').forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 72%',
        onEnter: () => el.classList.add('is-reached'),
        onLeaveBack: () => el.classList.remove('is-reached'),
      })
    })
  })

  return (
    <div className="spine" aria-hidden="true">
      <div ref={fill} className="spine-fill" />
    </div>
  )
}
