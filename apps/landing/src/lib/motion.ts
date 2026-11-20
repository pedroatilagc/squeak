import { useEffect, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin, useGSAP)

export { gsap, ScrollTrigger, useGSAP }

/** Consultas usadas por gsap.matchMedia em todas as seções. */
export const MQ = {
  /** Storytelling completo: desktop e movimento permitido */
  story: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
  /** Movimento permitido em qualquer tela */
  motion: '(prefers-reduced-motion: no-preference)',
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')

/** true quando o elemento está perto da viewport (para pausar/carregar o 3D). */
export function useInView<T extends Element>(ref: React.RefObject<T>, rootMargin = '200px') {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin])
  return inView
}
