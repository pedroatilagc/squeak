import { cssVar } from '../../lib/app'
import { GROUND, H as SH_SPRITE, PAL_KEYS, render, W as SW_SPRITE, type Pal, type Pose } from './render'

/**
 * Cena do fechamento: o Squeak entra por uma ponta da tela andando de lado, molhado, pingando.
 * No meio ele vira de frente, senta, abre o notebook no colo e resolve um bug (o terminal ao lado
 * narra cada passo). Depois fecha o notebook, levanta, vira de lado de novo e sai pela outra ponta.
 * Reaparece pela ponta de onde entrou e o ciclo recomeça.
 *
 * O pato é desenhado pelo mesmo renderizador do hero (sprite 128x112) e composto num palco largo
 * em pixels lógicos, escalado por fator inteiro. Chão, sombra, gotas, respingos e pegadas são
 * pintados no palco.
 */

export const STAGE_H = 124
const GY = 116 // linha do chão no palco
const SPRITE_X0 = 60 // centro horizontal do pato dentro do sprite
const SPEED = 24 // pixels lógicos por segundo
const STEP_PX = 13 // distância de um ciclo de passo

type Line = { text: string; kind: 'cmd' | 'info' | 'ok' | 'pr' }
type Session = { title: string; lines: Line[] }

const SESSIONS: Session[] = [
  {
    title: 'bug #58 · login quebra às sextas',
    lines: [
      { text: 'squeak fix 58', kind: 'cmd' },
      { text: 'lendo src/auth/session.ts', kind: 'info' },
      { text: 'achei: sexta usa UTC, não UTC-3', kind: 'info' },
      { text: 'patch +4 −1 em session.ts', kind: 'info' },
      { text: '23 testes passando', kind: 'ok' },
      { text: 'PR #58 aberto · +120 XP', kind: 'pr' },
    ],
  },
  {
    title: 'bug #61 · upload trava em 99%',
    lines: [
      { text: 'squeak fix 61', kind: 'cmd' },
      { text: 'reproduzindo com arquivo de 2GB', kind: 'info' },
      { text: 'o stream não fecha no fim', kind: 'info' },
      { text: 'await em finish() · +2 −1', kind: 'info' },
      { text: 'upload ok em 3 tentativas', kind: 'ok' },
      { text: 'PR #61 · review pedido pra ana', kind: 'pr' },
    ],
  },
  {
    title: 'flaky · checkout.spec',
    lines: [
      { text: 'squeak test --watch', kind: 'cmd' },
      { text: 'checkout.spec falha 1 em 5', kind: 'info' },
      { text: 'corrida no mock do relógio', kind: 'info' },
      { text: 'fakeTimers no beforeEach', kind: 'info' },
      { text: '50/50 execuções verdes', kind: 'ok' },
      { text: '#64 fechado · Firefighter +1', kind: 'pr' },
    ],
  },
]

function userSession(bug: string): Session {
  const short = bug.length > 20 ? bug.slice(0, 19).trimEnd() + '…' : bug
  return {
    title: 'seu bug',
    lines: [
      { text: `squeak investigate "${short}"`, kind: 'cmd' },
      { text: 'lendo os logs de produção', kind: 'info' },
      { text: 'achei: cache de sessão vencido', kind: 'info' },
      { text: 'patch +6 −2 · teste novo', kind: 'info' },
      { text: 'testes passando', kind: 'ok' },
      { text: 'PR aberto · valeu pelo bug!', kind: 'pr' },
    ],
  }
}

// linha do tempo da parada no meio (segundos desde a chegada)
const TURN = 0.32
const SIT = 0.3
const OPEN = 0.7
const LINE_EVERY = 1.25
const CLOSE = 0.5
const STAND = 0.3

type Drop = { x: number; y: number; vy: number; vx: number }
type Mark = { x: number; y: number; w: number; age: number; life: number; kind: 'print' | 'puddle' | 'splash' }

export type WalkerOptions = {
  reduced: boolean
  overlay: HTMLElement
  onQuack?: () => void
  pop: (text: string, xCss: number, yCss: number) => void
}

function readPalette(): Pal {
  const hex = (v: string) => {
    const n = parseInt(v.trim().replace('#', ''), 16)
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
const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`

export function createWalker(canvas: HTMLCanvasElement, opts: WalkerOptions) {
  const ctx = canvas.getContext('2d')!
  let pal = readPalette()
  let scale = 4
  let SW = 320

  // sprite do pato
  const sprite = document.createElement('canvas')
  sprite.width = SW_SPRITE
  sprite.height = SH_SPRITE
  const sctx = sprite.getContext('2d')!
  const img = sctx.createImageData(SW_SPRITE, SH_SPRITE)

  // terminal ao lado do pato
  const term = document.createElement('div')
  term.className = 'sq-term'
  term.innerHTML = '<div class="sq-term-bar"><i></i><i></i><i></i><span></span></div><ol class="sq-term-lines"></ol>'
  opts.overlay.appendChild(term)
  const termTitle = term.querySelector('span')!
  const termLines = term.querySelector('ol')!

  // estado
  let t = 0
  let x = -70
  let phase: 'walkIn' | 'stop' | 'walkOut' = 'walkIn'
  let stopT = 0
  let walked = 0
  let wet = 1
  let session = SESSIONS[0]
  let sessionIx = 0
  let queued: string | null = null
  let shownLines = 0
  let reactAt = -10
  let lastPlant = 0
  const drops: Drop[] = []
  const marks: Mark[] = []
  let dripTimer = 0

  const codeDur = () => session.lines.length * LINE_EVERY + 1.2
  const stopDur = () => TURN + SIT + OPEN + codeDur() + CLOSE + STAND + TURN

  const resize = () => {
    const w = canvas.parentElement!.clientWidth
    scale = w >= 1100 ? 4 : w >= 640 ? 3 : 2
    const oldSW = SW
    SW = Math.ceil(w / scale)
    canvas.width = SW
    canvas.height = STAGE_H
    canvas.style.width = `${SW * scale}px`
    canvas.style.height = `${STAGE_H * scale}px`
    ctx.imageSmoothingEnabled = false
    if (phase === 'stop') x = Math.round(SW / 2)
    else x = (x / oldSW) * SW
    placeTerm()
  }

  const center = () => Math.round(SW / 2)

  // ── terminal ────────────────────────────────────────────────────
  const openTerm = () => {
    termTitle.textContent = session.title
    termLines.replaceChildren()
    shownLines = 0
    term.classList.add('is-on')
    placeTerm()
  }
  const addLine = () => {
    const L = session.lines[shownLines++]
    const li = document.createElement('li')
    li.className = `sq-term-${L.kind}`
    li.textContent = L.text
    li.style.setProperty('--chars', String(L.text.length))
    termLines.appendChild(li)
  }
  const placeTerm = () => {
    const cx = center() * scale
    const wide = SW * scale - cx > 420
    term.classList.toggle('is-above', !wide)
    if (wide) {
      term.style.left = `${cx + 56 * scale}px`
      term.style.top = `${(GY - 78) * scale}px`
    } else {
      // tela estreita: o terminal fica acima do pato (o palco reserva esse espaço)
      term.style.left = `${cx}px`
      term.style.top = `${canvas.offsetTop + (GY - 96) * scale}px`
    }
  }

  // ── pose a partir do estado ─────────────────────────────────────
  const pose = (): Pose => {
    const P: Pose = {
      t, bob: 0, squashX: 1, squashY: 1, jump: 9, lean: 0, headX: 0, headY: 0, tail: 0, beakOpen: 0,
      glassLift: 0, brow: 'none', laptop: 0, typing: 0, glint: 0, flip: false, ripples: [], splash: [],
      glow: 0, pond: false, view: 'side', legs: 1, stride: undefined, lid: 0, wet,
    }
    const walking = phase !== 'stop'
    if (walking) {
      // gingado de pato: sobe e desce a cada passo e balança de um lado para o outro
      const s = (walked / STEP_PX) % 1
      const ph = s * Math.PI * 2
      P.stride = s
      P.jump = 9 + Math.round(Math.abs(Math.sin(ph)) * 1.4)
      P.lean = Math.sin(ph) * 0.03
      P.tail = Math.sin(ph * 2) * 0.8
      P.headY = Math.round(Math.cos(ph * 2) * 0.6)
      P.headX = Math.round(Math.sin(ph) * 0.6)
    } else {
      const k = t - stopT
      let a = k
      // 1) vira de frente
      if (a < TURN) {
        const f = a / TURN
        P.squashX = Math.max(0.12, Math.abs(Math.cos(f * Math.PI)))
        if (f > 0.5) ((P.view = 'front'), (P.legs = 0))
      } else {
        P.view = 'front'
        P.legs = 0
      }
      a -= TURN
      // 2) senta (com um quique)
      if (a >= 0) {
        if (a < SIT) {
          const f = a / SIT
          P.jump = Math.round(9 * (1 - f))
          P.squashY = 1 - Math.sin(f * Math.PI) * 0.07
          P.squashX *= 1 + Math.sin(f * Math.PI) * 0.05
        } else P.jump = 0
      }
      a -= SIT
      // 3) abre o notebook
      if (a >= 0) P.lid = Math.min(1, a / OPEN)
      a -= OPEN
      // 4) programa
      const code = codeDur()
      if (a >= 0 && a < code) {
        P.lid = 1
        P.typing = 1
        P.glow = 0.75 + Math.sin(t * 9) * 0.15
        P.headY = 1
        const line = Math.min(session.lines.length - 1, Math.floor(a / LINE_EVERY))
        const kind = session.lines[line].kind
        if (kind === 'ok' || kind === 'pr') {
          P.brow = 'smug'
          P.glint = ((a % LINE_EVERY) / LINE_EVERY) * 1.2
        } else if (session.lines[line].text.startsWith('achei')) P.brow = 'up'
        // pausa para pensar no meio da sessão
        if (line === 2 && a % LINE_EVERY > 0.6) {
          P.typing = 0
          P.headX = Math.sin(t * 3) > 0 ? 1 : -1
        }
      }
      a -= code
      // 5) fecha o notebook
      if (a >= 0) {
        P.lid = Math.max(0, 1 - a / CLOSE)
        P.brow = 'smug'
      }
      a -= CLOSE
      // 6) levanta
      if (a >= 0) {
        const f = Math.min(1, a / STAND)
        P.jump = Math.round(9 * f + Math.sin(f * Math.PI) * 3)
        P.squashY = 1 + Math.sin(f * Math.PI) * 0.06
      }
      a -= STAND
      // 7) vira de lado de novo
      if (a >= 0) {
        const f = Math.min(1, a / TURN)
        P.squashX = Math.max(0.12, Math.abs(Math.cos(f * Math.PI)))
        if (f > 0.5) {
          P.view = 'side'
          P.legs = 1
          P.lid = 0
        }
        P.jump = 9
      }
    }
    // reação ao clique: quack
    const r = t - reactAt
    if (r < 0.75) {
      P.beakOpen = r < 0.12 ? r / 0.12 : r < 0.5 ? 1 : Math.max(0, 1 - (r - 0.5) / 0.25)
      P.brow = 'up'
      P.squashY *= 1 + Math.sin(Math.min(1, r * 2) * Math.PI) * 0.06
    }
    return P
  }

  // ── simulação ───────────────────────────────────────────────────
  const plantFoot = (fx: number) => {
    marks.push({ x: Math.round(fx), y: GY + 1, w: 4, age: 0, life: 4 + wet * 4, kind: 'print' })
  }
  const step = (dt: number) => {
    t += dt
    if (phase === 'walkIn' || phase === 'walkOut') {
      const d = SPEED * dt
      x += d
      walked += d
      // pegada a cada meio passo (um pé de cada vez)
      const s = walked / (STEP_PX / 2)
      if (Math.floor(s) !== Math.floor(lastPlant)) plantFoot(x - 4 + (Math.floor(s) % 2) * 9)
      lastPlant = s
      if (phase === 'walkIn' && x >= center()) {
        x = center()
        phase = 'stop'
        stopT = t
        if (queued) {
          session = userSession(queued)
          queued = null
        } else {
          session = SESSIONS[sessionIx++ % SESSIONS.length]
        }
      }
      if (phase === 'walkOut' && x > SW + 70) {
        // reaparece pela ponta de onde entrou, recém-saído da lagoa
        x = -70
        phase = 'walkIn'
        wet = 1
      }
    } else {
      const k = t - stopT
      const codeStart = TURN + SIT + OPEN
      if (k >= codeStart && !term.classList.contains('is-on')) openTerm()
      while (term.classList.contains('is-on') && shownLines < session.lines.length && k - codeStart >= shownLines * LINE_EVERY) addLine()
      if (k > codeStart + codeDur() && term.classList.contains('is-on')) term.classList.remove('is-on')
      if (k > stopDur()) {
        phase = 'walkOut'
        if (session.lines.length) opts.pop(session.lines[session.lines.length - 1].kind === 'pr' ? '+120 XP' : 'feito', x * scale, (GY - 104) * scale)
      }
    }
    // vai secando aos poucos
    wet = Math.max(0.2, wet - dt * 0.018)

    // gotas que caem do corpo
    dripTimer -= dt * (0.6 + wet * 2.4)
    if (dripTimer <= 0) {
      dripTimer = 0.35 + Math.random() * 0.5
      const front = phase === 'stop' && t - stopT > TURN * 0.5 && t - stopT < stopDur() - TURN * 0.5
      const spread = front ? 30 : 34
      const dx = (Math.random() * 2 - 1) * spread
      const fromY = GY - (front ? 8 : 12) - Math.random() * 6
      drops.push({ x: x + dx + (front ? 0 : -6), y: fromY, vy: 0, vx: phase === 'stop' ? 0 : -4 })
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      d.vy += 160 * dt
      d.y += d.vy * dt
      d.x += d.vx * dt
      if (d.y >= GY) {
        drops.splice(i, 1)
        marks.push({ x: Math.round(d.x), y: GY, w: 1, age: 0, life: 0.25, kind: 'splash' })
        marks.push({ x: Math.round(d.x), y: GY + 1 + (Math.random() < 0.5 ? 1 : 0), w: 2 + Math.round(Math.random() * 2), age: 0, life: 3 + wet * 3, kind: 'puddle' })
      }
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      marks[i].age += dt
      if (marks[i].age > marks[i].life) marks.splice(i, 1)
    }
  }

  // ── desenho ─────────────────────────────────────────────────────
  let spriteFrame = -1
  let spriteX = 0
  let spriteY = 0
  const draw = () => {
    ctx.clearRect(0, 0, SW, STAGE_H)
    const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
    const dither = (px: number, py: number, a: number) => BAY[(py & 3) * 4 + (px & 3)] / 16 < a

    // marcas no chão: pegadas e poças que somem com dither
    for (const m of marks) {
      const a = 1 - m.age / m.life
      ctx.fillStyle = rgb(m.kind === 'splash' ? pal.w4 : pal.wet)
      if (m.kind === 'splash') {
        ctx.fillRect(m.x - 1, m.y - 1, 1, 1)
        ctx.fillRect(m.x + 1, m.y - 1, 1, 1)
        continue
      }
      for (let k = 0; k < m.w; k++) if (dither(m.x + k, m.y, a)) ctx.fillRect(m.x + k, m.y, 1, 1)
      if (m.kind === 'print' && dither(m.x + 1, m.y + 1, a)) ctx.fillRect(m.x + 1, m.y + 1, 2, 1)
    }

    // sombra no chão
    const P = pose()
    const cx = Math.round(x)
    const sh = P.view === 'front' ? 34 : 38
    ctx.fillStyle = rgb(pal.shadow)
    for (let k = -sh; k <= sh; k++) {
      const edge = Math.abs(k) / sh
      if (edge < 0.8 || dither(cx + k, GY, 1 - edge)) ctx.fillRect(cx + k, GY, 1, 1)
      if (edge < 0.55) ctx.fillRect(cx + k, GY + 1, 1, 1)
    }

    // pato (o sprite muda a 12 fps, como animação de sprite)
    const f = Math.floor(t * 12)
    if (f !== spriteFrame) {
      spriteFrame = f
      render(P, pal, img)
      sctx.putImageData(img, 0, 0)
    }
    spriteX = cx - SPRITE_X0
    spriteY = GY - GROUND
    ctx.drawImage(sprite, spriteX, spriteY)

    // gotas caindo
    ctx.fillStyle = rgb(pal.rim)
    for (const d of drops) ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 2)
  }

  // ── clique ──────────────────────────────────────────────────────
  const toStage = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect()
    return [Math.floor(((e.clientX - r.left) / r.width) * SW), Math.floor(((e.clientY - r.top) / r.height) * STAGE_H)] as const
  }
  const onDuck = (sx: number, sy: number) => {
    const lx = sx - spriteX
    const ly = sy - spriteY
    if (lx < 0 || ly < 0 || lx >= SW_SPRITE || ly >= SH_SPRITE) return false
    return img.data[(ly * SW_SPRITE + lx) * 4 + 3] > 0
  }
  const quack = () => {
    reactAt = t
    opts.onQuack?.()
    opts.pop('QUACK!', x * scale, (GY - 106) * scale)
    if (opts.reduced) {
      spriteFrame = -1
      draw()
      window.setTimeout(() => {
        reactAt = -10
        spriteFrame = -1
        draw()
      }, 900)
    }
  }
  const onClick = (e: MouseEvent) => {
    const [sx, sy] = toStage(e)
    if (onDuck(sx, sy)) quack()
  }
  const onMove = (e: MouseEvent) => {
    const [sx, sy] = toStage(e)
    canvas.style.cursor = onDuck(sx, sy) ? 'pointer' : ''
  }
  canvas.addEventListener('click', onClick)
  canvas.addEventListener('mousemove', onMove)

  // ── laço ────────────────────────────────────────────────────────
  let raf = 0
  let running = false
  let last = 0
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    step(dt)
    draw()
    raf = requestAnimationFrame(loop)
  }

  const ro = new ResizeObserver(() => {
    resize()
    if (!running) draw()
  })
  ro.observe(canvas.parentElement!)
  resize()

  if (opts.reduced) {
    // quadro parado: sentado de frente, programando, com o terminal completo
    phase = 'stop'
    x = center()
    stopT = -(TURN + SIT + OPEN + LINE_EVERY * 4)
    t = 0
    openTerm()
    while (shownLines < session.lines.length) addLine()
    term.classList.add('is-static')
  }
  draw()

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
    /** o visitante explicou um bug: entra na fila da próxima sessão, e o pato dá um quack */
    explain(bug: string) {
      queued = bug
      quack()
    },
    repaint() {
      pal = readPalette()
      spriteFrame = -1
      draw()
    },
    destroy() {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('mousemove', onMove)
      term.remove()
    },
  }
}
