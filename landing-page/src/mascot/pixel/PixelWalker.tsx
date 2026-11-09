import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { createWalker, STAGE_H } from './walker'
import { app } from '../../lib/app'
import { useStore } from '../../lib/store'
import { squeak } from '../../lib/sound'
import { useInView, useReducedMotion } from '../../lib/motion'

export type PixelWalkerHandle = { explain: (bug: string) => void }

/**
 * Palco de ponta a ponta onde o Squeak atravessa a tela, senta no meio para programar e segue.
 */
export const PixelWalker = forwardRef<PixelWalkerHandle, { className?: string }>(function PixelWalker({ className = '' }, ref) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const inView = useInView(wrap, '120px')
  const theme = useStore(app, (s) => s.theme)
  const walker = useRef<ReturnType<typeof createWalker> | null>(null)

  useEffect(() => {
    if (!canvas.current || !overlay.current) return
    const ov = overlay.current
    const pop = (text: string, x: number, y: number) => {
      const el = document.createElement('div')
      el.className = 'px-pop sq-walk-pop'
      el.textContent = text
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      ov.appendChild(el)
      window.setTimeout(() => el.remove(), 1800)
    }
    const w = createWalker(canvas.current, { reduced, overlay: ov, pop, onQuack: () => squeak(1.1) })
    walker.current = w
    return () => {
      w.destroy()
      walker.current = null
      ov.querySelectorAll('.sq-walk-pop').forEach((n) => n.remove())
    }
  }, [reduced])

  useEffect(() => {
    if (inView) walker.current?.start()
    else walker.current?.stop()
  }, [inView, reduced])

  useEffect(() => {
    walker.current?.repaint()
  }, [theme])

  useImperativeHandle(ref, () => ({ explain: (bug: string) => walker.current?.explain(bug) }), [])

  return (
    <div ref={wrap} className={`sq-walk ${className}`} style={{ minHeight: `calc(${STAGE_H}px * 2)` }}>
      <canvas
        ref={canvas}
        className="sq-canvas sq-walk-canvas"
        role="img"
        aria-label="Squeak, o pato de borracha de óculos escuros, atravessa a tela pingando água, senta no meio, abre o notebook no colo e resolve um bug. Clique nele."
      />
      <div ref={overlay} className="px-overlay sq-walk-overlay" aria-hidden="true" />
    </div>
  )
})
