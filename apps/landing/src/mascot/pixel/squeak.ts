import { cssVar } from '../../lib/app'
import { H, hit, PAL_KEYS, render, W, WATER, type Pal, type Pose } from './render'

/**
 * Comportamento do Squeak em pixel art: respira, balança, abana o rabo, olha para o cursor
 * (e vira de lado se o cursor passar para o outro lado), faz cara de convencido, varre um brilho
 * no óculos e, de vez em quando, tira o notebook de baixo da asa para digitar.
 * Cliques disparam reações em ciclo; cliques demais deixam o pato bravo.
 */

type Action = { name: ActionName; t0: number; dur: number }
type ActionName = 'quack' | 'dealwithit' | 'jump' | 'lgtm' | 'type' | 'smug' | 'look' | 'wag' | 'glint' | 'angry'

const CLICK_CYCLE: ActionName[] = ['quack', 'dealwithit', 'jump', 'lgtm']
const IDLE_POOL: ActionName[] = ['glint', 'smug', 'wag', 'type', 'look', 'glint', 'wag']
const DUR: Record<ActionName, number> = {
  quack: 0.75, dealwithit: 2.1, jump: 1.0, lgtm: 2.6, type: 4.2, smug: 1.6, look: 1.8, wag: 0.9, glint: 0.7, angry: 1.6,
}

export type SqueakOptions = {
  reduced: boolean
  pond: boolean
  say: (text: string, kind?: 'bubble' | 'pop') => void
  onQuack?: () => void
}

function readPalette(): Pal {
  const hex = (v: string) => {
    const h = v.trim().replace('#', '')
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as [number, number, number]
  }
  const pal = {} as Pal
  for (const k of PAL_KEYS) {
    if (k === 'white') pal[k] = hex(cssVar('--catchlight'))
    else if (k === 'black') pal[k] = hex(cssVar('--px-ink'))
    else pal[k] = hex(cssVar(`--sq-${k}`))
  }
  return pal
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
const bump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(x * Math.PI))

export function createSqueak(canvas: HTMLCanvasElement, opts: SqueakOptions) {
  const ctx = canvas.getContext('2d')!
  canvas.width = W
  canvas.height = H
  ctx.imageSmoothingEnabled = false
  const img = ctx.createImageData(W, H)
  let pal = readPalette()

  let t = 0
  let action: Action | null = null
  let nextIdle = 2.5
  let clickIx = 0
  const clickTimes: number[] = []
  let lookX = 0
  let lookY = 0
  let targetLX = 0
  let targetLY = 0
  let facingLeft = false
  let flipAnim = 0 // 0..1: virando
  const ripples: Pose['ripples'] = []
  const splash: Pose['splash'] = []
  let lastBubbleAt = -10
  let cursorBehind = 0 // posição do cursor em relação à cabeça, em larguras do pato

  const start = (name: ActionName) => {
    action = { name, t0: t, dur: DUR[name] }
    if (name === 'quack') {
      opts.say('QUACK!', 'pop')
      opts.onQuack?.()
      ripples.push({ age: 0, strength: 0.9 })
    }
    if (name === 'jump') ripples.push({ age: 0, strength: 0.6 })
    if (name === 'type' && t - lastBubbleAt > 12) {
      lastBubbleAt = t
      opts.say(['git commit -m "fix"', 'npm run quack', 'compilando…', 'só mais um teste'][Math.floor(Math.random() * 4)])
    }
    if (name === 'angry') opts.say('ei! eu sou o pato, não o bug.')
  }

  const pose = (): Pose => {
    const P: Pose = {
      t, bob: 0, squashX: 1, squashY: 1, jump: 0, lean: 0, headX: 0, headY: 0, tail: 0, beakOpen: 0,
      glassLift: 0, brow: 'none', laptop: 0, typing: 0, glint: 0, flip: facingLeft, ripples, splash, glow: 0,
      pond: opts.pond,
    }
    if (!opts.reduced) {
      // respiração e flutuação: degraus de 1px, como animação de sprite
      P.bob = Math.floor(t * 1.6) % 2
      const breath = Math.sin(t * 2.2) * 0.015
      P.squashY = 1 + breath
      P.squashX = 1 - breath * 0.6
      P.tail = Math.sin(t * 1.3) * 0.5
    }
    P.headX = Math.round(lookX * 2)
    P.headY = Math.round(lookY * 1.5)
    // virar de lado: achata no meio do giro
    if (flipAnim > 0) {
      P.squashX *= Math.max(0.15, Math.abs(Math.cos(flipAnim * Math.PI)))
      P.flip = flipAnim < 0.5 ? !facingLeft : facingLeft
    }

    if (action) {
      const k = (t - action.t0) / action.dur
      switch (action.name) {
        case 'quack': {
          P.beakOpen = k < 0.15 ? k / 0.15 : k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.3)
          const s = bump(Math.min(1, k * 2))
          P.squashY *= 1 + s * 0.08
          P.squashX *= 1 - s * 0.05
          P.headY -= Math.round(s * 2)
          P.brow = 'up'
          break
        }
        case 'dealwithit': {
          // sobe, mostra os olhos, cai com tudo e quica
          if (k < 0.12) P.glassLift = ease(k / 0.12)
          else if (k < 0.55) P.glassLift = 1
          else if (k < 0.72) P.glassLift = 1 - Math.pow((k - 0.55) / 0.17, 2)
          else P.glassLift = bump((k - 0.72) / 0.1) * 0.12
          P.brow = k < 0.6 ? 'up' : 'smug'
          if (k > 0.72 && k < 0.8) P.squashY *= 0.95
          break
        }
        case 'jump': {
          P.jump = Math.round(bump(Math.min(1, k / 0.7)) * 14)
          if (k < 0.08) P.squashY *= 0.88
          if (k > 0.7 && k < 0.82) {
            P.squashY *= 0.85
            P.squashX *= 1.1
          }
          // giro no ar
          if (k > 0.2 && k < 0.5) {
            const f = (k - 0.2) / 0.3
            P.squashX *= Math.max(0.12, Math.abs(Math.cos(f * Math.PI)))
            if (f > 0.5) P.flip = !P.flip
          }
          P.beakOpen = k > 0.15 && k < 0.6 ? 0.6 : 0
          P.brow = 'up'
          break
        }
        case 'lgtm':
        case 'type': {
          const open = action.name === 'lgtm' ? 0.22 : 0.3
          const close = action.name === 'lgtm' ? 0.85 : 0.88
          P.laptop = k < open ? ease(k / open) : k < close ? 1 : 1 - ease((k - close) / (1 - close))
          P.typing = action.name === 'type' && P.laptop >= 1 ? 1 : 0
          P.glow = P.laptop >= 1 ? 0.8 + Math.sin(t * 9) * 0.2 : 0
          P.headY += P.laptop >= 1 ? 1 : 0
          P.headX += P.laptop >= 1 ? 1 : 0
          P.brow = action.name === 'lgtm' && P.laptop >= 1 ? 'smug' : 'none'
          break
        }
        case 'smug':
          P.brow = 'smug'
          P.lean = bump(k) * 0.06
          P.headX += Math.round(bump(k) * 1)
          break
        case 'look':
          P.headX += Math.round(Math.sin(k * Math.PI * 2) * 2)
          P.headY += k > 0.3 && k < 0.7 ? -1 : 0
          break
        case 'wag':
          P.tail = Math.sin(k * Math.PI * 6) * 2.5
          P.lean = Math.sin(k * Math.PI * 6) * 0.02
          break
        case 'glint':
          P.glint = k
          break
        case 'angry':
          P.brow = 'angry'
          P.headX += Math.round(Math.sin(k * 60) * 1)
          P.beakOpen = k < 0.4 ? 0.5 : 0
          break
      }
    }
    return P
  }

  const step = (dt: number) => {
    t += dt
    // olhar suave + decisão de virar
    const e = Math.min(1, dt * 6)
    lookX += (targetLX - lookX) * e
    lookY += (targetLY - lookY) * e
    if (flipAnim > 0) flipAnim = Math.min(1, flipAnim + dt / 0.22)
    if (flipAnim >= 1) flipAnim = 0
    // vira de lado se o cursor ficar bem atrás dele (decide no laço, não só no movimento)
    if (!opts.reduced && flipAnim === 0 && action?.name !== 'jump') {
      if (!facingLeft && cursorBehind < -0.35) ((facingLeft = true), (flipAnim = 0.001))
      else if (facingLeft && cursorBehind > 0.35) ((facingLeft = false), (flipAnim = 0.001))
    }
    if (action && t - action.t0 > action.dur) {
      if (action.name === 'jump') ripples.push({ age: 0, strength: 1 }), splashBurst()
      if (action.name === 'dealwithit') opts.say('deal with it.', 'pop')
      action = null
    }
    if (!action && !opts.reduced && t > nextIdle) {
      start(IDLE_POOL[Math.floor(Math.random() * IDLE_POOL.length)])
      nextIdle = t + DUR[action!.name] + 3 + Math.random() * 3.5
    }
    if (action?.name === 'lgtm' && t - action.t0 > 0.7 && t - action.t0 < 0.7 + dt) opts.say('LGTM ✓', 'pop')
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += dt * 0.7
      if (ripples[i].age > 1) ripples.splice(i, 1)
    }
    for (let i = splash.length - 1; i >= 0; i--) {
      const d = splash[i]
      d.age += dt
      d.vy += 120 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      if (d.y > WATER + 3 || d.age > 1.2) splash.splice(i, 1)
    }
  }

  const splashBurst = () => {
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1
      splash.push({ x: 62 + side * (18 + Math.random() * 14), y: WATER, vx: side * (10 + Math.random() * 25), vy: -30 - Math.random() * 30, age: 0 })
    }
  }

  // estado só muda a ~12 quadros por segundo de "pose" (animação de sprite),
  // mas a água e o olhar seguem suaves
  const draw = () => {
    render(pose(), pal, img)
    ctx.putImageData(img, 0, 0)
  }

  // ── entrada ─────────────────────────────────────────────────────
  const toLogical = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect()
    return [Math.floor(((e.clientX - r.left) / r.width) * W), Math.floor(((e.clientY - r.top) / r.height) * H)] as const
  }
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    const headX = r.left + (r.width * (facingLeft ? W - 76 : 76)) / W
    const headY = r.top + (r.height * 38) / H
    const dx = e.clientX - headX
    const dy = e.clientY - headY
    const dirX = facingLeft ? -dx : dx
    targetLX = Math.max(-1, Math.min(1, dirX / 260))
    targetLY = Math.max(-1, Math.min(1, dy / 220))
    cursorBehind = dx / r.width
    const [lx, ly] = toLogical(e)
    canvas.style.cursor = hit(lx, ly) ? 'pointer' : ''
  }
  const onClick = (e: MouseEvent) => {
    const [lx, ly] = toLogical(e)
    if (!hit(lx, ly)) return
    react()
  }
  const react = () => {
    clickTimes.push(t)
    while (clickTimes.length && t - clickTimes[0] > 2.2) clickTimes.shift()
    if (clickTimes.length >= 5) {
      clickTimes.length = 0
      start('angry')
    } else {
      start(CLICK_CYCLE[clickIx % CLICK_CYCLE.length])
      clickIx++
    }
    nextIdle = t + DUR[action!.name] + 4
    if (opts.reduced) showStill()
  }
  // movimento reduzido: mostra o quadro-chave da reação por um instante, sem animar
  let stillTimer = 0
  const showStill = () => {
    if (!action) return draw()
    const saved = t
    t = action.t0 + action.dur * 0.45
    draw()
    t = saved
    window.clearTimeout(stillTimer)
    stillTimer = window.setTimeout(() => {
      action = null
      draw()
    }, 1400)
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  canvas.addEventListener('click', onClick)

  let raf = 0
  let running = false
  let last = 0
  // a simulação roda a cada quadro, mas o desenho é a 12 fps, como animação de sprite
  let lastFrame = -1
  const FPS = 12
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    step(dt)
    const f = Math.floor(t * FPS)
    if (f !== lastFrame) {
      lastFrame = f
      draw()
    }
    raf = requestAnimationFrame(loop)
  }
  // primeiro quadro só quando entrar na tela (ou já, se o movimento for reduzido)
  if (opts.reduced) draw()

  return {
    start() {
      if (running || opts.reduced) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(loop)
    },
    stop() {
      running = false
      cancelAnimationFrame(raf)
    },
    /** reação vinda de fora (ex.: o formulário do fechamento) */
    poke(name: ActionName = 'quack') {
      start(name)
      if (opts.reduced) showStill()
    },
    repaint() {
      pal = readPalette()
      draw()
    },
    destroy() {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('click', onClick)
    },
  }
}
