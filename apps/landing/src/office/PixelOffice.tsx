import { useEffect, useRef } from 'react'
import { createOffice, H, W } from './engine'
import { squeak } from '../lib/sound'
import { useInView, useReducedMotion } from '../lib/motion'

const LABELS: Record<string, string> = {
  pr57: 'abrindo PR #57',
  fix51: 'corrigindo #51',
  review57: 'revisando #57 com o pedro',
  coffee: 'pausa pro café',
  merged57: '#57 mergeado!',
  daily: 'daily · 2 pessoas',
  closed60: 'fechou #60',
  arcade: 'testando o build no fliperama',
  help51: 'destravou o caio no #51',
  sofa: 'lendo o RFC de auth',
  badge: 'Eagle Eye III!',
  quack: 'quack!',
}

/**
 * Escritório virtual em pixel art, desenhado e animado em código.
 * Escala sempre por fator inteiro para os pixels ficarem nítidos.
 */
export function PixelOffice() {
  const frame = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const inView = useInView(frame, '100px')
  const office = useRef<ReturnType<typeof createOffice> | null>(null)

  useEffect(() => {
    if (!canvas.current || !overlay.current) return
    const o = createOffice(canvas.current, overlay.current, { reduced, onQuack: () => squeak(1.2), label: (k) => LABELS[k] ?? k })
    office.current = o
    return () => {
      o.destroy()
      office.current = null
    }
  }, [reduced])

  useEffect(() => {
    if (inView) office.current?.start()
    else office.current?.stop()
  }, [inView, reduced])

  // escala inteira: maior múltiplo de 384 que cabe na largura
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const fit = () => {
      const w = el.clientWidth
      const k = w >= W ? Math.floor(w / W) : w / W
      el.style.setProperty('--px-scale', String(k))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={frame} className="px-frame">
      <div className="px-stage" style={{ width: `calc(${W}px * var(--px-scale, 1))`, height: `calc(${H}px * var(--px-scale, 1))` }}>
        <canvas
          ref={canvas}
          className="px-canvas"
          role="img"
          aria-label="Escritório virtual em pixel art: patinhos de borracha trabalham em mesas, abrem e mergeiam PRs, fazem a daily na sala de reunião, tomam café e jogam fliperama. Clique num pato para ele dar um quack."
        />
        <div ref={overlay} className="px-overlay" aria-hidden="true" />
      </div>
    </div>
  )
}
