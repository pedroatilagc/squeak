import { cssVar } from '../lib/app'
import { buildSprites, SPRITE_H, SPRITE_W, type Accessory, type Palette, type View } from './sprites'

/**
 * Escritório virtual em pixel art. Resolução interna 384x216, escalada por fator inteiro.
 * Tudo é desenhado em código: cenário (camada estática), patos (sprites), objetos vivos
 * (monitores, cafeteira, fliperama, servidores, neon, estrelas) e partículas.
 * Os balões e o HUD são HTML por cima, em fonte pixel, para serem legíveis e acessíveis.
 */

export const W = 384
export const H = 216

const WALL_H = 44
const AISLE_Y = 108
const DOOR_X = 312

type Pt = { x: number; y: number }
type DuckState = 'sit' | 'walk' | 'stand'

type Duck = {
  id: number
  name: string
  acc: Accessory
  x: number
  y: number
  seat: Pt
  desk: number
  state: DuckState
  view: View
  facing: 1 | -1
  path: Pt[]
  onArrive?: () => void
  standView?: View
  standFacing?: 1 | -1
  jumpAt: number
  bubble: HTMLDivElement
  bubbleUntil: number
}

type Desk = { x: number; y: number; screen: 'code' | 'off' | 'merged' | 'review'; flashUntil: number; lines: number[] }
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; kind: 'confetti' | 'steam' | 'spark' }

const DESKS: Pt[] = [
  { x: 28, y: 58 }, { x: 92, y: 58 }, { x: 156, y: 58 },
  { x: 28, y: 122 }, { x: 92, y: 122 }, { x: 156, y: 122 },
]
const seatOf = (d: Pt): Pt => ({ x: d.x + 22, y: d.y + 36 })

const SPOTS = {
  meetLeft: { x: 272, y: 80, view: 'side' as View, facing: 1 as const },
  meetRight: { x: 350, y: 80, view: 'side' as View, facing: -1 as const },
  meetFront: { x: 312, y: 92, view: 'back' as View, facing: 1 as const },
  coffee: { x: 348, y: 154, view: 'side' as View, facing: 1 as const },
  arcade: { x: 262, y: 176, view: 'back' as View, facing: 1 as const },
  sofa: { x: 316, y: 200, view: 'front' as View, facing: 1 as const },
}

const CREW: { name: string; acc: Accessory }[] = [
  { name: 'pedro', acc: 'headset' },
  { name: 'ana', acc: 'shades' },
  { name: 'caio', acc: 'beanie' },
  { name: 'lu', acc: 'cap' },
  { name: 'bia', acc: 'bow' },
  { name: 'zé', acc: 'none' },
]

function readPalette(): Palette {
  const v = (n: string) => cssVar(`--px-${n}`)
  return {
    ink: v('ink'), night: v('night'), sky: v('sky'), star: v('star'), wall: v('wall'), wallHi: v('wall-hi'),
    trim: v('trim'), wood: v('wood'), woodDk: v('wood-dk'), woodHi: v('wood-hi'), carpet: v('carpet'),
    carpetDk: v('carpet-dk'), tile: v('tile'), tileDk: v('tile-dk'), desk: v('desk'), deskDk: v('desk-dk'),
    metal: v('metal'), metalDk: v('metal-dk'), screen: v('screen'), duck: v('duck'), duckDk: v('duck-dk'),
    duckHi: v('duck-hi'), beak: v('beak'), beakDk: v('beak-dk'), eye: v('eye'), white: v('white'),
    blue: v('blue'), blueDk: v('carpet'), green: v('green'), red: v('red'), purple: v('purple'),
    pink: v('pink'), pinkDk: v('red'), leaf: v('leaf'), leafDk: v('leaf-dk'), pot: v('pot'),
  }
}

/** pseudo-aleatório determinístico (cenário estável entre renders) */
function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

export type OfficeOptions = { reduced: boolean; onQuack?: () => void; label: (k: string) => string }

export function createOffice(canvas: HTMLCanvasElement, overlay: HTMLElement, opts: OfficeOptions) {
  const ctx = canvas.getContext('2d')!
  canvas.width = W
  canvas.height = H
  ctx.imageSmoothingEnabled = false

  const pal = readPalette()
  const sprite = buildSprites(pal)
  const bg = document.createElement('canvas')
  bg.width = W
  bg.height = H
  drawStatic(bg.getContext('2d')!, pal)

  // ── estado ───────────────────────────────────────────────────
  const desks: Desk[] = DESKS.map(() => ({ x: 0, y: 0, screen: 'code', flashUntil: 0, lines: [] }))
  desks.forEach((d, i) => {
    d.x = DESKS[i].x
    d.y = DESKS[i].y
    d.lines = [8, 5, 10, 6]
  })
  const ducks: Duck[] = CREW.map((c, i) => {
    const seat = seatOf(DESKS[i])
    const bubble = document.createElement('div')
    bubble.className = 'px-bubble'
    overlay.appendChild(bubble)
    return {
      id: i, name: c.name, acc: c.acc, x: seat.x, y: seat.y, seat, desk: i,
      state: 'sit', view: 'back', facing: 1, path: [], jumpAt: -10, bubble, bubbleUntil: 0,
    }
  })
  const particles: Particle[] = []
  const board = { todo: 3, doing: 2, done: 2, moving: -1, moveT: 0 }
  let meetingLive = false
  let coffeeOn = 0
  let arcadeOn = false
  let t = 0
  let loopStart = 0
  const LOOP = 42

  const hud = document.createElement('div')
  hud.className = 'px-hud'
  overlay.appendChild(hud)
  const clock = document.createElement('div')
  clock.className = 'px-hud px-hud--right'
  overlay.appendChild(clock)

  // ── ações do roteiro ─────────────────────────────────────────
  const say = (d: Duck, text: string, secs = 4) => {
    d.bubble.textContent = `${d.name}: ${text}`
    d.bubble.classList.add('is-on')
    d.bubbleUntil = t + secs
  }
  const popup = (x: number, y: number, text: string, kind: 'xp' | 'badge' = 'xp') => {
    const el = document.createElement('div')
    el.className = `px-pop px-pop--${kind}`
    el.textContent = text
    el.style.left = `${(x / W) * 100}%`
    el.style.top = `${(y / H) * 100}%`
    overlay.appendChild(el)
    window.setTimeout(() => el.remove(), 1800)
  }
  const confetti = (x: number, y: number) => {
    const colors = [pal.duck, pal.beak, pal.blue, pal.green, pal.pink, pal.purple]
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI - Math.PI
      const sp = 30 + Math.random() * 50
      particles.push({ x, y, vx: Math.cos(a) * sp * 0.7, vy: Math.sin(a) * sp, life: 0, max: 1.2 + Math.random() * 0.6, color: colors[i % colors.length], kind: 'confetti' })
    }
  }
  const route = (d: Duck, to: Pt, gateX?: number): Pt[] => {
    const pts: Pt[] = []
    const gx = gateX ?? to.x
    if (d.y !== AISLE_Y) pts.push({ x: d.x, y: AISLE_Y })
    if (gx !== d.x) pts.push({ x: gx, y: AISLE_Y })
    if (to.y !== AISLE_Y) pts.push({ x: gx, y: to.y })
    if (to.x !== gx) pts.push({ x: to.x, y: to.y })
    return pts
  }
  const goTo = (d: Duck, spot: Pt & { view?: View; facing?: 1 | -1 }, gateX?: number, then?: () => void) => {
    d.path = route(d, spot, gateX)
    d.state = 'walk'
    d.standView = spot.view ?? 'front'
    d.standFacing = spot.facing ?? 1
    d.onArrive = then
    desks[d.desk].screen = 'off'
  }
  const goHome = (d: Duck) =>
    goTo(d, d.seat, undefined, () => {
      d.state = 'sit'
      d.view = 'back'
      desks[d.desk].screen = 'code'
    })
  const [pedro, ana, caio, lu, bia, ze] = ducks

  const script: { at: number; run: () => void; done?: boolean }[] = [
    { at: 0.5, run: () => (say(pedro, opts.label('pr57')), say(caio, opts.label('fix51'))) },
    { at: 3.0, run: () => goTo(ana, { x: pedro.seat.x + 16, y: pedro.seat.y, view: 'side', facing: -1 }, undefined, () => say(ana, opts.label('review57'), 3.8)) },
    { at: 6.5, run: () => goTo(caio, SPOTS.coffee, DOOR_X, () => { coffeeOn = t + 6; say(caio, opts.label('coffee'), 5) }) },
    { at: 9.0, run: () => {
      desks[pedro.desk].screen = 'merged'
      desks[pedro.desk].flashUntil = t + 2.5
      pedro.jumpAt = t
      confetti(pedro.x, pedro.y - 14)
      popup(pedro.x, pedro.y - 22, '+120 XP')
      say(pedro, opts.label('merged57'), 3.5)
      board.moving = 0
      board.moveT = 0
    } },
    { at: 11.0, run: () => goHome(ana) },
    { at: 12.5, run: () => { desks[pedro.desk].screen = 'code' } },
    { at: 13.5, run: () => {
      meetingLive = true
      goTo(lu, SPOTS.meetLeft, DOOR_X, () => say(lu, opts.label('daily'), 6))
      goTo(bia, SPOTS.meetRight, DOOR_X)
    } },
    { at: 14.0, run: () => goHome(caio) },
    { at: 19.0, run: () => {
      ze.jumpAt = t
      desks[ze.desk].screen = 'merged'
      desks[ze.desk].flashUntil = t + 2
      popup(ze.x, ze.y - 22, '+50 XP')
      say(ze, opts.label('closed60'), 3.5)
      confetti(ze.x, ze.y - 14)
      board.moving = 1
      board.moveT = 0
    } },
    { at: 21.5, run: () => { desks[ze.desk].screen = 'code' } },
    { at: 23.0, run: () => { meetingLive = false; goHome(lu); goHome(bia) } },
    { at: 25.0, run: () => goTo(caio, SPOTS.arcade, DOOR_X, () => { arcadeOn = true; say(caio, opts.label('arcade'), 5) }) },
    { at: 27.0, run: () => say(ana, opts.label('help51'), 4) },
    { at: 28.0, run: () => goTo(bia, SPOTS.sofa, DOOR_X, () => say(bia, opts.label('sofa'), 4)) },
    { at: 32.0, run: () => { arcadeOn = false; goHome(caio) } },
    { at: 33.5, run: () => goHome(bia) },
    { at: 36.0, run: () => {
      popup(ana.x, ana.y - 22, 'Eagle Eye III', 'badge')
      ana.jumpAt = t
      confetti(ana.x, ana.y - 14)
      say(ana, opts.label('badge'), 3.5)
    } },
  ]

  // ── simulação ────────────────────────────────────────────────
  const SPEED = 34
  function step(dt: number) {
    t += dt
    if (t - loopStart > LOOP) {
      loopStart = t
      script.forEach((s) => (s.done = false))
      Object.assign(board, { todo: 3, doing: 2, done: 2, moving: -1 })
    }
    const lt = t - loopStart
    for (const s of script) if (!s.done && lt >= s.at) ((s.done = true), s.run())

    for (const d of ducks) {
      if (d.state === 'walk') {
        const target = d.path[0]
        if (!target) {
          d.state = 'stand'
          d.view = d.standView ?? 'front'
          d.facing = d.standFacing ?? 1
          d.onArrive?.()
          d.onArrive = undefined
          continue
        }
        const dx = target.x - d.x
        const dy = target.y - d.y
        const dist = Math.hypot(dx, dy)
        const mv = SPEED * dt
        if (dist <= mv) {
          d.x = target.x
          d.y = target.y
          d.path.shift()
        } else {
          d.x += (dx / dist) * mv
          d.y += (dy / dist) * mv
        }
        if (Math.abs(dx) > Math.abs(dy)) {
          d.view = 'side'
          d.facing = dx > 0 ? 1 : -1
        } else d.view = dy < 0 ? 'back' : 'front'
      }
      if (d.bubbleUntil && t > d.bubbleUntil) {
        d.bubble.classList.remove('is-on')
        d.bubbleUntil = 0
      }
    }
    if (board.moving >= 0) {
      board.moveT += dt / 0.9
      if (board.moveT >= 1) {
        board.doing -= 1
        board.done += 1
        board.moving = -1
        if (board.doing <= 0) Object.assign(board, { todo: board.todo - 1, doing: 2 })
      }
    }
    // partículas
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life += dt
      if (p.life > p.max) {
        particles.splice(i, 1)
        continue
      }
      if (p.kind === 'confetti') p.vy += 90 * dt
      if (p.kind === 'steam') p.vx = Math.sin((p.life + p.y) * 6) * 4
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    if (coffeeOn > t && Math.random() < dt * 9)
      particles.push({ x: 366 + Math.random() * 3, y: 136, vx: 0, vy: -10, life: 0, max: 1.4, color: pal.metal, kind: 'steam' })
    // código rolando nos monitores
    if (Math.floor(t * 3) !== Math.floor((t - dt) * 3))
      desks.forEach((d) => {
        d.lines.shift()
        d.lines.push(3 + Math.floor(Math.random() * 9))
      })
  }

  // ── desenho por quadro ───────────────────────────────────────
  function draw() {
    ctx.drawImage(bg, 0, 0)
    drawLive(ctx, pal, t, { desks, meetingLive, coffeeOn: coffeeOn > t, arcadeOn, board })

    // patos + cadeiras, ordenados pela profundidade (pé)
    const order = [...ducks].sort((a, b) => a.y - b.y)
    for (const d of order) {
      const since = t - d.jumpAt
      const jump = since < 0.5 ? Math.round(Math.sin((since / 0.5) * Math.PI) * 7) : 0
      let bob = 0
      if (d.state === 'walk') bob = Math.floor(t * 8 + d.id) % 2
      else if (d.state === 'sit') bob = Math.floor(t * 5 + d.id * 1.3) % 2
      else bob = Math.floor(t * 1.6 + d.id) % 2
      const sx = Math.round(d.x - SPRITE_W / 2)
      const sy = Math.round(d.y - SPRITE_H) + bob - jump
      // sombra no chão
      ctx.fillStyle = pal.ink
      ctx.globalAlpha = 0.35
      ctx.fillRect(Math.round(d.x - 6), Math.round(d.y) - 1, 12, 2)
      ctx.globalAlpha = 1
      // pezinhos alternando ao andar
      if (d.state === 'walk') {
        const f = Math.floor(t * 8 + d.id) % 2
        ctx.fillStyle = pal.beak
        ctx.fillRect(Math.round(d.x) - 4 + f * 2, Math.round(d.y) - 1, 3, 1)
        ctx.fillRect(Math.round(d.x) + 1 + (1 - f) * 2, Math.round(d.y) - 1, 3, 1)
      }
      const img = sprite(d.view, d.acc)
      if (d.view === 'side' && d.facing === -1) {
        ctx.save()
        ctx.translate(sx + SPRITE_W, sy)
        ctx.scale(-1, 1)
        ctx.drawImage(img, 0, 0)
        ctx.restore()
      } else ctx.drawImage(img, sx, sy)
      // cadeira de costas por cima de quem está sentado
      if (d.state === 'sit') drawChairBack(ctx, pal, Math.round(d.x), Math.round(d.y))
      // posição do balão
      d.bubble.style.left = `${(d.x / W) * 100}%`
      d.bubble.style.top = `${((sy - 2) / H) * 100}%`
    }

    // robô aspirador passeando pelo corredor do escritório
    const rx = Math.round(40 + ((Math.sin(t * 0.21) + 1) / 2) * 170)
    const ry = Math.round(AISLE_Y + 4 + Math.sin(t * 0.47) * 3)
    ctx.fillStyle = pal.ink
    ctx.fillRect(rx - 5, ry - 2, 10, 5)
    ctx.fillStyle = pal.metalDk
    ctx.fillRect(rx - 4, ry - 2, 8, 3)
    ctx.fillStyle = Math.floor(t * 2) % 2 ? pal.green : pal.metal
    ctx.fillRect(rx - 1, ry - 2, 2, 1)

    for (const p of particles) {
      ctx.globalAlpha = p.kind === 'steam' ? 0.55 * (1 - p.life / p.max) : 1
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.kind === 'confetti' ? 2 : 1, p.kind === 'confetti' ? 1 : 2)
    }
    ctx.globalAlpha = 1

    // HUD
    const mins = 9 * 60 + 30 + Math.floor((t - loopStart) * 1.5)
    clock.textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
    hud.textContent = `SQUEAK HQ · ${ducks.length} online`
  }

  // ── interação: clique num pato ───────────────────────────────
  const pick = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const y = ((e.clientY - r.top) / r.height) * H
    return ducks.find((d) => Math.abs(d.x - x) < 9 && y > d.y - 18 && y < d.y + 2)
  }
  const onClick = (e: MouseEvent) => {
    const d = pick(e)
    if (!d) return
    d.jumpAt = t
    say(d, opts.label('quack'), 2)
    opts.onQuack?.()
    if (opts.reduced) draw()
  }
  const onMove = (e: MouseEvent) => {
    canvas.style.cursor = pick(e) ? 'pointer' : ''
  }
  canvas.addEventListener('click', onClick)
  canvas.addEventListener('mousemove', onMove)

  // ── laço ─────────────────────────────────────────────────────
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

  if (opts.reduced) {
    // quadro estático: o momento do merge, com balões fixos
    t = 9.2
    ana.x = pedro.seat.x + 16
    ana.y = pedro.seat.y
    ana.state = 'stand'
    ana.view = 'side'
    ana.facing = -1
    desks[ana.desk].screen = 'off'
    desks[pedro.desk].screen = 'merged'
    desks[pedro.desk].flashUntil = 1e9
    say(pedro, opts.label('merged57'), 1e9)
    say(caio, opts.label('fix51'), 1e9)
    say(lu, opts.label('daily'), 1e9)
    draw()
  } else {
    step(0)
    draw()
  }

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
    destroy() {
      running = false
      cancelAnimationFrame(raf)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('mousemove', onMove)
      overlay.replaceChildren()
    },
  }
}

// ═════════════════════════════════════════════════════════════════
// Cenário estático
// ═════════════════════════════════════════════════════════════════
function rect(g: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) {
  g.fillStyle = c
  g.fillRect(x, y, w, h)
}

function drawStatic(g: CanvasRenderingContext2D, p: Palette) {
  const r = rng(7)
  rect(g, p.night, 0, 0, W, H)

  // parede do fundo
  rect(g, p.wall, 0, 0, W, WALL_H)
  for (let x = 0; x < W; x += 24) rect(g, p.wallHi, x, 0, 1, WALL_H - 4)
  rect(g, p.trim, 0, WALL_H - 4, W, 2)
  rect(g, p.ink, 0, WALL_H - 2, W, 2)

  // janelas com céu noturno e skyline
  for (const wx of [14, 66]) {
    rect(g, p.ink, wx - 1, 5, 44, 30)
    rect(g, p.sky, wx, 6, 42, 28)
    for (let i = 0; i < 9; i++) {
      const bh = 6 + Math.floor(r() * 14)
      const bx = wx + i * 5
      rect(g, p.night, bx, 34 - bh, 5, bh)
      for (let j = 0; j < bh - 3; j += 3) if (r() > 0.6) rect(g, p.duckDk, bx + 1 + Math.floor(r() * 3), 34 - bh + 2 + j, 1, 1)
    }
    rect(g, p.trim, wx + 20, 6, 2, 28)
    rect(g, p.trim, wx, 19, 42, 1)
    rect(g, p.metal, wx - 1, 34, 44, 2)
  }

  // quadro branco (kanban é desenhado vivo)
  rect(g, p.ink, 119, 5, 80, 32)
  rect(g, p.white, 120, 6, 78, 28)
  rect(g, p.metalDk, 120, 34, 78, 2)
  for (const cx of [146, 172]) rect(g, p.metal, cx, 9, 1, 23)

  // tela da sala de reunião
  rect(g, p.ink, 271, 7, 80, 30)
  rect(g, p.screen, 272, 8, 78, 26)
  rect(g, p.metalDk, 306, 37, 10, 3)

  // relógio
  rect(g, p.ink, 360, 10, 13, 13)
  rect(g, p.white, 361, 11, 11, 11)
  rect(g, p.ink, 366, 13, 1, 4)
  rect(g, p.ink, 366, 16, 3, 1)

  // piso: madeira no escritório e corredor
  for (let y = WALL_H; y < H; y += 6) {
    rect(g, y % 12 === 2 ? p.wood : p.woodDk, 0, y, 236, 6)
    rect(g, p.woodHi, 0, y, 236, 1)
    let x = Math.floor(r() * 30)
    while (x < 236) {
      rect(g, p.ink, x, y + 1, 1, 5)
      x += 22 + Math.floor(r() * 26)
    }
  }
  // corredor (mesma madeira) à direita
  for (let y = 96; y < 132; y += 6) {
    rect(g, y % 12 === 0 ? p.wood : p.woodDk, 236, y, W - 236, 6)
    rect(g, p.woodHi, 236, y, W - 236, 1)
  }
  // carpete da sala de reunião
  rect(g, p.carpet, 236, WALL_H, W - 236, 52)
  for (let y = WALL_H; y < 96; y += 4) for (let x = 236 + ((y / 4) % 2) * 2; x < W; x += 4) rect(g, p.carpetDk, x, y, 1, 1)
  // piso xadrez do lounge
  for (let y = 132; y < H; y += 12) for (let x = 236; x < W; x += 12) rect(g, ((x - 236) / 12 + (y - 132) / 12) % 2 ? p.tile : p.tileDk, x, y, 12, 12)

  // paredes de vidro da reunião (esquerda e embaixo, com porta)
  rect(g, p.trim, 234, WALL_H, 3, 52)
  g.globalAlpha = 0.18
  rect(g, p.blue, 237, WALL_H, 2, 52)
  g.globalAlpha = 1
  rect(g, p.trim, 234, 94, DOOR_X - 12 - 234, 3)
  rect(g, p.trim, DOOR_X + 12, 94, W - DOOR_X - 12, 3)
  rect(g, p.metal, DOOR_X - 13, 92, 2, 6)
  rect(g, p.metal, DOOR_X + 11, 92, 2, 6)

  // mureta do lounge (com porta) e parede esquerda dele
  rect(g, p.wallHi, 234, 128, DOOR_X - 12 - 234, 5)
  rect(g, p.wallHi, DOOR_X + 12, 128, W - DOOR_X - 12, 5)
  rect(g, p.trim, 234, 128, DOOR_X - 12 - 234, 1)
  rect(g, p.trim, DOOR_X + 12, 128, W - DOOR_X - 12, 1)
  rect(g, p.wallHi, 234, 133, 3, H - 133)

  // mesa redonda da reunião + cadeiras
  ellipse(g, p.ink, 312, 72, 30, 11)
  ellipse(g, p.desk, 312, 71, 29, 10)
  ellipse(g, p.deskDk, 312, 74, 29, 7, true)
  for (const [cx, cy] of [[278, 74], [346, 74], [296, 60], [328, 60]]) {
    rect(g, p.ink, cx - 4, cy - 3, 9, 7)
    rect(g, p.metalDk, cx - 3, cy - 2, 7, 5)
  }
  // notebook na mesa
  rect(g, p.metal, 304, 66, 14, 2)
  rect(g, p.screen, 306, 62, 10, 4)

  // rack de servidores
  rect(g, p.ink, 4, 46, 18, 46)
  rect(g, p.metalDk, 5, 47, 16, 44)
  for (let y = 50; y < 88; y += 6) rect(g, p.ink, 6, y, 14, 4)

  // balcão do café
  rect(g, p.ink, 351, 133, 33, 26)
  rect(g, p.desk, 352, 134, 32, 8)
  rect(g, p.deskDk, 352, 142, 32, 16)
  // cafeteira
  rect(g, p.ink, 360, 122, 14, 14)
  rect(g, p.metalDk, 361, 123, 12, 12)
  rect(g, p.ink, 364, 130, 6, 4)
  rect(g, p.white, 365, 133, 4, 3)

  // fliperama
  rect(g, p.ink, 251, 136, 22, 30)
  rect(g, p.purple, 252, 137, 20, 28)
  rect(g, p.ink, 254, 141, 16, 11)
  rect(g, p.metalDk, 252, 154, 20, 4)
  rect(g, p.red, 256, 155, 2, 2)
  rect(g, p.blue, 264, 155, 2, 2)
  rect(g, p.ink, 253, 164, 18, 3)

  // sofá: encosto, braços, almofadas
  rect(g, p.ink, 289, 181, 54, 26)
  rect(g, p.pinkDk, 290, 182, 52, 10)
  rect(g, p.pink, 290, 182, 52, 2)
  rect(g, p.pink, 296, 191, 19, 9)
  rect(g, p.pink, 317, 191, 19, 9)
  rect(g, p.ink, 315, 191, 2, 9)
  rect(g, p.pinkDk, 296, 199, 40, 6)
  rect(g, p.pink, 290, 188, 6, 17)
  rect(g, p.pink, 336, 188, 6, 17)
  rect(g, p.ink, 290, 205, 3, 2)
  rect(g, p.ink, 339, 205, 3, 2)
  rect(g, p.duck, 299, 186, 6, 5)
  rect(g, p.ink, 299, 186, 6, 1)
  // tapete
  rect(g, p.ink, 284, 160, 64, 20)
  rect(g, p.carpet, 285, 161, 62, 18)
  for (let x = 287; x < 346; x += 4) rect(g, p.carpetDk, x, 163, 2, 14)

  // pufe
  ellipse(g, p.ink, 256, 200, 11, 8)
  ellipse(g, p.blue, 256, 199, 10, 7)
  ellipse(g, p.carpet, 256, 202, 10, 4, true)

  // mesas de trabalho
  DESKS.forEach((d) => {
    rect(g, p.ink, d.x - 1, d.y - 1, 46, 22)
    rect(g, p.desk, d.x, d.y, 44, 12)
    rect(g, p.deskDk, d.x, d.y + 12, 44, 8)
    rect(g, p.ink, d.x + 2, d.y + 20, 2, 3)
    rect(g, p.ink, d.x + 40, d.y + 20, 2, 3)
    // monitor
    rect(g, p.ink, d.x + 13, d.y - 12, 18, 13)
    rect(g, p.screen, d.x + 14, d.y - 11, 16, 10)
    rect(g, p.metalDk, d.x + 20, d.y + 1, 4, 2)
    // teclado e caneca
    rect(g, p.metal, d.x + 15, d.y + 6, 14, 3)
    rect(g, p.white, d.x + 36, d.y + 3, 4, 4)
    rect(g, p.beak, d.x + 36, d.y + 3, 4, 1)
  })
}

function ellipse(g: CanvasRenderingContext2D, c: string, cx: number, cy: number, rx: number, ry: number, bottomOnly = false) {
  g.fillStyle = c
  for (let y = -ry; y <= ry; y++) {
    if (bottomOnly && y < 0) continue
    const w = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)))
    g.fillRect(cx - w, cy + y, w * 2, 1)
  }
}

function drawChairBack(g: CanvasRenderingContext2D, p: Palette, x: number, y: number) {
  rect(g, p.ink, x - 7, y - 5, 14, 5)
  rect(g, p.metalDk, x - 6, y - 4, 12, 3)
  rect(g, p.trim, x - 6, y - 4, 12, 1)
  rect(g, p.ink, x - 1, y, 2, 3)
  rect(g, p.ink, x - 5, y + 3, 10, 1)
  rect(g, p.ink, x - 6, y + 4, 2, 1)
  rect(g, p.ink, x + 4, y + 4, 2, 1)
}

// ═════════════════════════════════════════════════════════════════
// Objetos vivos
// ═════════════════════════════════════════════════════════════════
type Live = {
  desks: Desk[]
  meetingLive: boolean
  coffeeOn: boolean
  arcadeOn: boolean
  board: { todo: number; doing: number; done: number; moving: number; moveT: number }
}

function glow(g: CanvasRenderingContext2D, c: string, cx: number, cy: number, r: number, a: number) {
  g.globalAlpha = a
  g.fillStyle = c
  for (const k of [1, 0.66, 0.36]) {
    const rr = Math.round(r * k)
    for (let y = -rr; y <= rr; y += 1) {
      const w = Math.round(Math.sqrt(rr * rr - y * y))
      g.fillRect(cx - w, cy + y, w * 2, 1)
    }
  }
  g.globalAlpha = 1
}

function drawLive(g: CanvasRenderingContext2D, p: Palette, t: number, s: Live) {
  const r = rng(Math.floor(t * 2) + 3)

  // estrelas piscando nas janelas
  for (const wx of [14, 66])
    for (let i = 0; i < 5; i++) {
      const sx = wx + 3 + ((i * 9 + wx) % 38)
      const sy = 8 + ((i * 7) % 8)
      if ((Math.floor(t * 1.5 + i * 1.7) % 4) !== 0) rect(g, p.star, sx, sy, 1, 1)
    }
  // estrela cadente de vez em quando
  const sh = (t % 13) / 13
  if (sh < 0.06) {
    const k = sh / 0.06
    rect(g, p.star, 70 + Math.round(k * 30), 8 + Math.round(k * 8), 2, 1)
  }

  // neon do pato (pisca de vez em quando)
  const flick = Math.floor(t * 10) % 37 === 0 ? 0.3 : 1
  g.globalAlpha = flick
  neonDuck(g, p, 210, 12)
  g.globalAlpha = 1
  glow(g, p.pink, 218, 22, 14, 0.06 * flick)

  // kanban no quadro branco
  const cols = [123, 149, 175]
  const sticky = (col: number, i: number, c: string) => rect(g, c, cols[col] + (i % 2) * 11, 10 + Math.floor(i / 2) * 7, 9, 5)
  for (let i = 0; i < s.board.todo; i++) sticky(0, i, p.duck)
  for (let i = 0; i < s.board.doing; i++) if (!(s.board.moving >= 0 && i === s.board.doing - 1)) sticky(1, i, p.blue)
  for (let i = 0; i < s.board.done; i++) sticky(2, i, p.green)
  if (s.board.moving >= 0) {
    const k = Math.min(1, s.board.moveT)
    const fromX = cols[1] + ((s.board.doing - 1) % 2) * 11
    const toX = cols[2] + (s.board.done % 2) * 11
    const fromY = 10 + Math.floor((s.board.doing - 1) / 2) * 7
    const toY = 10 + Math.floor(s.board.done / 2) * 7
    rect(g, k > 0.5 ? p.green : p.blue, Math.round(fromX + (toX - fromX) * k), Math.round(fromY + (toY - fromY) * k - Math.sin(k * Math.PI) * 3), 9, 5)
  }

  // tela da reunião
  if (s.meetingLive) {
    for (let i = 0; i < 3; i++) {
      rect(g, p.carpet, 276 + i * 25, 12, 22, 16)
      rect(g, p.duck, 283 + i * 25, 16, 8, 8)
      rect(g, p.beak, 289 + i * 25, 20, 3, 2)
    }
    if (Math.floor(t * 2) % 2) rect(g, p.red, 345, 10, 3, 3)
    glow(g, p.blue, 311, 26, 22, 0.05)
  } else {
    // descanso de tela: barrinha de sprint
    rect(g, p.trim, 280, 20, 62, 4)
    rect(g, p.green, 280, 20, 42 + Math.floor((t * 2) % 4), 4)
  }

  // monitores
  const codeColors = [p.blue, p.green, p.duck, p.purple]
  s.desks.forEach((d, i) => {
    const x = d.x + 14
    const y = d.y - 11
    if (d.screen === 'off') {
      rect(g, p.screen, x, y, 16, 10)
      const bx = x + 2 + Math.floor((t * 6 + i * 3) % 10)
      rect(g, p.trim, bx, y + 4, 2, 2)
      return
    }
    if (d.screen === 'merged' && d.flashUntil > t) {
      rect(g, p.green, x, y, 16, 10)
      rect(g, p.screen, x + 5, y + 5, 2, 2)
      rect(g, p.screen, x + 7, y + 6, 2, 2)
      rect(g, p.screen, x + 9, y + 4, 2, 2)
      rect(g, p.screen, x + 11, y + 2, 2, 2)
      glow(g, p.green, x + 8, y + 12, 16, 0.08)
      return
    }
    rect(g, p.screen, x, y, 16, 10)
    d.lines.forEach((len, li) => rect(g, codeColors[(li + i) % 4], x + 2 + (li % 2) * 2, y + 2 + li * 2, Math.min(12, len), 1))
    if (Math.floor(t * 3) % 2) rect(g, p.white, x + 2 + Math.min(12, d.lines[3]) + 3, y + 8, 1, 1)
    glow(g, p.blue, x + 8, y + 14, 14, 0.05)
  })

  // servidores: LEDs
  for (let y = 51; y < 88; y += 6) {
    rect(g, r() > 0.3 ? p.green : p.metalDk, 8, y + 1, 1, 1)
    rect(g, r() > 0.7 ? p.duck : p.metalDk, 11, y + 1, 1, 1)
    rect(g, p.blue, 15 + (Math.floor(t * 4 + y) % 3), y + 1, 1, 1)
  }

  // cafeteira
  rect(g, s.coffeeOn ? p.red : p.green, 371, 125, 1, 1)
  if (s.coffeeOn) glow(g, p.beak, 367, 134, 10, 0.06)

  // fliperama
  const ar = s.arcadeOn ? Math.floor(t * 8) : Math.floor(t * 2)
  const ac = [p.pink, p.blue, p.green, p.duck]
  rect(g, p.screen, 255, 142, 14, 9)
  rect(g, ac[ar % 4], 256 + (ar * 3) % 11, 144 + (ar % 3) * 2, 2, 2)
  rect(g, ac[(ar + 2) % 4], 262, 149, 4, 1)
  glow(g, p.purple, 262, 150, s.arcadeOn ? 16 : 11, s.arcadeOn ? 0.09 : 0.05)

  // planta balançando
  const sway = Math.floor(t * 1.2) % 2
  rect(g, p.ink, 365, 196, 14, 12)
  rect(g, p.pot, 366, 197, 12, 10)
  rect(g, p.leafDk, 368 + sway, 180, 3, 17)
  rect(g, p.leaf, 364 - sway, 184, 6, 3)
  rect(g, p.leaf, 372 + sway, 182, 6, 3)
  rect(g, p.leaf, 366, 189 + sway, 5, 3)
  rect(g, p.leaf, 371 - sway, 187, 6, 3)
}

function neonDuck(g: CanvasRenderingContext2D, p: Palette, x: number, y: number) {
  const px = (dx: number, dy: number) => rect(g, p.pink, x + dx, y + dy, 1, 1)
  // contorno de pato em neon (cabeça + corpo + bico)
  const pts = [
    [6, 0], [7, 0], [8, 0], [5, 1], [9, 1], [4, 2], [10, 2], [11, 3], [12, 3], [13, 3], [12, 4], [4, 3], [4, 4], [10, 4],
    [5, 5], [9, 5], [3, 6], [2, 7], [1, 8], [1, 9], [1, 10], [2, 11], [3, 12], [4, 12], [5, 12], [6, 12], [7, 12],
    [8, 12], [9, 12], [10, 12], [11, 11], [12, 10], [12, 9], [11, 8], [10, 7], [10, 6], [0, 7], [0, 6], [1, 6],
  ]
  pts.forEach(([a, b]) => px(a, b))
  rect(g, p.duck, x + 7, y + 2, 1, 1)
}
