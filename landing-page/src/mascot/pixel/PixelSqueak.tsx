import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { createSqueak } from './squeak'
import { H, W } from './render'
import { app } from '../../lib/app'
import { useStore } from '../../lib/store'
import { squeak } from '../../lib/sound'
import { useInView, useReducedMotion } from '../../lib/motion'

export type PixelSqueakHandle = { poke: () => void }

type Props = {
  /** lago com reflexo (hero) ou sem água (fechamento) */
  pond?: boolean
  /** maior escala inteira permitida */
  maxScale?: number
  className?: string
  label?: string
}

/**
 * O Squeak em pixel art, escalado sempre por fator inteiro para os pixels ficarem nítidos.
 * Balões e "QUACK!" são HTML por cima, em fonte pixel.
 */
export const PixelSqueak = forwardRef<PixelSqueakHandle, Props>(function PixelSqueak(
  { pond = true, maxScale = 6, className = '', label = 'Squeak, o pato de borracha de óculos escuros com um notebook debaixo da asa. Clique nele.' },
  ref,
) {
  const frame = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const inView = useInView(frame, '80px')
  const theme = useStore(app, (s) => s.theme)
  const duck = useRef<ReturnType<typeof createSqueak> | null>(null)

  useEffect(() => {
    if (!canvas.current || !overlay.current) return
    const ov = overlay.current
    const say = (text: string, kind: 'bubble' | 'pop' = 'bubble') => {
      const el = document.createElement('div')
      el.className = kind === 'pop' ? 'px-pop sq-pop' : 'px-bubble sq-bubble is-on'
      el.textContent = text
      ov.appendChild(el)
      window.setTimeout(() => el.remove(), kind === 'pop' ? 1800 : 2600)
    }
    const d = createSqueak(canvas.current, { reduced, pond, say, onQuack: () => squeak(1.1) })
    duck.current = d
    return () => {
      d.destroy()
      duck.current = null
      ov.replaceChildren()
    }
  }, [reduced, pond])

  useEffect(() => {
    if (inView) duck.current?.start()
    else duck.current?.stop()
  }, [inView, reduced, pond])

  useEffect(() => {
    duck.current?.repaint()
  }, [theme])

  useImperativeHandle(ref, () => ({ poke: () => duck.current?.poke() }), [])

  // escala inteira que cabe no espaço (antes do primeiro paint: sem salto de layout)
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const fit = () => {
      const k = Math.max(1, Math.min(maxScale, Math.floor(Math.min(el.clientWidth / W, el.clientHeight / H))))
      el.style.setProperty('--px-scale', String(k))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [maxScale])

  return (
    <div ref={frame} className={`sq-frame ${className}`}>
      <div className="sq-stage" style={{ width: `calc(${W}px * var(--px-scale, 1))`, height: `calc(${H}px * var(--px-scale, 1))` }}>
        <canvas ref={canvas} className="sq-canvas" width={W} height={H} role="img" aria-label={label} />
        <div ref={overlay} className="px-overlay sq-overlay" aria-hidden="true" />
      </div>
    </div>
  )
})
