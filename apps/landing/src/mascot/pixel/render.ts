/**
 * Renderizador de pixel art do Squeak.
 *
 * O pato é descrito por formas (elipses e quadriláteros) organizadas em camadas. A cada quadro,
 * cada pixel da grade 128x112 descobre qual camada está na frente, calcula uma "normal de cúpula"
 * da forma e escolhe um tom da rampa do material com dithering ordenado (Bayer 4x4), como um pixel
 * artist faria à mão. Depois vêm o contorno seletivo, as linhas entre partes, o brilho em cluster,
 * os elementos desenhados pixel a pixel (óculos thug life, sobrancelhas, olhos, adesivo) e a água
 * com reflexo ondulado.
 */

export const W = 128
export const H = 112
export const WATER = 88

export type Pose = {
  t: number
  bob: number
  squashX: number
  squashY: number
  jump: number
  lean: number
  headX: number
  headY: number
  tail: number
  beakOpen: number
  glassLift: number
  brow: 'none' | 'smug' | 'up' | 'angry'
  /** 0 = notebook debaixo da asa, 1 = aberto na frente */
  laptop: number
  typing: number
  glint: number
  flip: boolean
  ripples: { age: number; strength: number }[]
  splash: { x: number; y: number; vx: number; vy: number; age: number }[]
  glow: number
  pond: boolean
  /** lateral (padrão) ou de frente, sentado */
  view?: 'side' | 'front'
  /** patas visíveis (fora da água): 0 = não, 1 = sim */
  legs?: number
  /** fase do ciclo de caminhada (0..1) */
  stride?: number
  /** de frente: abertura da tampa do notebook no colo (0..1) */
  lid?: number
  /** quão molhado está (gotinhas no corpo) 0..1 */
  wet?: number
}

/** linha do chão dentro do sprite (pés tocam aqui) */
export const GROUND = 91

export type Pal = Record<string, [number, number, number]>

// materiais: rampas (escuro → claro)
const RAMPS = {
  rubber: ['y1', 'y2', 'y3', 'y4'],
  beak: ['o1', 'o2', 'o3'],
  metal: ['m1', 'm2', 'm3', 'm4'],
} as const
type Mat = keyof typeof RAMPS

const THRESH: Record<Mat, number[]> = {
  rubber: [0.4, 0.62, 0.84],
  beak: [0.48, 0.78],
  metal: [0.36, 0.56, 0.8],
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47)
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)]

// luz vindo de cima-esquerda-frente (coordenadas de tela: y para baixo)
const L = (() => {
  const v = [-0.5, -0.72, 0.48]
  const n = Math.hypot(...v)
  return v.map((c) => c / n)
})()

type Box = { x0: number; y0: number; x1: number; y1: number }
type Ellipse = { k: 'e'; cx: number; cy: number; rx: number; ry: number; c: number; s: number; c2: number; s2: number }
type Quad = { k: 'q'; pts: [number, number][]; nz: number; nx: number; ny: number }
type Shape = (Ellipse | Quad) & { part: number; bb: Box }
type Layer = { mat: Mat; shapes: Shape[] }

const E = (part: number, cx: number, cy: number, rx: number, ry: number, rotDeg = 0): Shape => {
  const rot = (rotDeg * Math.PI) / 180
  const m = Math.max(rx, ry)
  return {
    k: 'e', part, cx, cy, rx, ry,
    c: Math.cos(-rot), s: Math.sin(-rot), c2: Math.cos(rot), s2: Math.sin(rot),
    bb: { x0: cx - m, y0: cy - m, x1: cx + m, y1: cy + m },
  }
}
const Q = (part: number, pts: [number, number][], nx = 0, ny = -0.3, nz = 0.9): Shape => ({
  k: 'q', part, pts, nx, ny, nz,
  bb: {
    x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])),
  },
})

/** ponto dentro de uma forma: devolve altura (z) e normal, ou null */
type Hit = { z: number; nx: number; ny: number; nz: number }
const HITS: Hit[] = [0, 1, 2].map(() => ({ z: 0, nx: 0, ny: 0, nz: 0 }))
let hitSlot = 0
function sample(s: Shape, x: number, y: number): Hit | null {
  if (x < s.bb.x0 || x > s.bb.x1 || y < s.bb.y0 || y > s.bb.y1) return null
  if (s.k === 'e') {
    const dx = x - s.cx
    const dy = y - s.cy
    const c = s.c
    const si = s.s
    const ux = dx * c - dy * si
    const uy = dx * si + dy * c
    const a = ux / s.rx
    const b = uy / s.ry
    const d2 = a * a + b * b
    if (d2 > 1) return null
    const nz = Math.sqrt(1 - d2)
    // normal de volta para o espaço da tela
    const c2 = s.c2
    const s2 = s.s2
    const nx = a * c2 - b * s2
    const ny = a * s2 + b * c2
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    const h = HITS[hitSlot++ % 3]
    h.z = nz * Math.min(s.rx, s.ry)
    h.nx = nx / len
    h.ny = ny / len
    h.nz = nz / len
    return h
  }
  // quadrilátero convexo
  const p = s.pts
  let sign = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]
    const [x2, y2] = p[(i + 1) % p.length]
    const cr = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
    if (cr !== 0) {
      if (sign === 0) sign = Math.sign(cr)
      else if (Math.sign(cr) !== sign) return null
    }
  }
  const h = HITS[hitSlot++ % 3]
  h.z = 4
  h.nx = s.nx
  h.ny = s.ny
  h.nz = s.nz
  return h
}

type Built = {
  layers: Layer[]
  laptopQuad: [number, number][] | null
  lidQuad: [number, number][] | null
  /** de frente: tampa do notebook vista por trás */
  frontLid: { x0: number; x1: number; top: number; bottom: number } | null
}

// ── de frente, sentado, notebook no colo ────────────────────────────
function buildFront(P: Pose): Built {
  const hx = P.headX
  const hy = P.headY
  const ob = P.beakOpen
  const lid = P.lid ?? 0
  const typing = P.typing > 0 && lid > 0.8
  const tapL = typing ? Math.floor(P.t * 11) % 2 : 0
  const tapR = typing ? Math.floor(P.t * 11 + 1) % 2 : 0

  const body: Layer = {
    mat: 'rubber',
    shapes: [E(1, 60, 72, 30, 16), E(1, 60, 78, 27, 9)],
  }
  // asas: em repouso nas laterais; digitando, entram por trás da tampa até o teclado
  const wingsIn = lid > 0.35
  const wings: Layer = {
    mat: 'rubber',
    shapes: wingsIn
      ? [E(3, 35, 74 + tapL, 8, 12.5, 40), E(3, 85, 74 + tapR, 8, 12.5, -40)]
      : [E(3, 31, 71, 7.5, 13, 10), E(3, 89, 71, 7.5, 13, -10)],
  }
  const head: Layer = {
    mat: 'rubber',
    shapes: [
      E(7, 60 + hx, 41 + hy, 19.5, 19),
      E(7, 49 + hx, 49 + hy, 7, 5.5),
      E(7, 71 + hx, 49 + hy, 7, 5.5),
      E(8, 58 + hx, 22 + hy, 2.8, 6, -18),
      E(8, 63 + hx, 23.5 + hy, 2.2, 4.4, 28),
    ],
  }
  const beakLower: Layer = { mat: 'beak', shapes: [E(9, 60 + hx, 54.5 + hy + ob * 3, 7.5, 2.6 + ob)] }
  const beakUpper: Layer = { mat: 'beak', shapes: [E(11, 60 + hx, 51 + hy - ob * 0.5, 10.5, 3.8)] }

  const lidH = Math.round(2 + 22 * lid)
  const bottom = 84
  const top = bottom - lidH
  const laptop: Layer = {
    mat: 'metal',
    shapes: [
      Q(12, [[36, 86], [84, 86], [82, 83], [38, 83]], 0, -0.6, 0.7),
      Q(13, [[38, bottom], [82, bottom], [81, top], [39, top]], 0, 0.15, 0.4),
    ],
  }
  return {
    layers: [body, wings, head, beakLower, beakUpper, laptop],
    laptopQuad: null,
    lidQuad: null,
    frontLid: { x0: 39, x1: 81, top, bottom },
  }
}

// ── geometria do pato em função da pose ─────────────────────────────
function buildLayers(P: Pose): Built {
  if (P.view === 'front') return buildFront(P)
  const hx = P.headX
  const hy = P.headY
  const tail = P.tail

  const body: Layer = {
    mat: 'rubber',
    shapes: [
      E(1, 56, 70, 34, 21),
      E(1, 78, 67, 17, 19),
      E(1, 56, 83, 33, 7),
      E(2, 31, 59 + tail * 0.4, 15, 8, 33 + tail * 4),
      E(2, 21.5, 51 + tail * 0.8, 8, 4.4, 48 + tail * 6),
    ],
  }

  // notebook debaixo da asa (tampa vista de frente), desliza para fora quando abre
  const out = Math.min(1, P.laptop * 2)
  const lx = 52 + out * 30
  const ly = 74 - out * 4
  const tuckedQuad: [number, number][] = [
    [lx - 17, ly - 4],
    [lx + 16, ly - 7],
    [lx + 18, ly + 7],
    [lx - 15, ly + 10],
  ]
  // aberto: base (teclado) e tampa vista por trás, na frente do peito
  const open = Math.max(0, P.laptop * 2 - 1)
  const baseQuad: [number, number][] = [
    [78, 85],
    [108, 85],
    [114, 80],
    [85, 80],
  ]
  const lidTopY = 81 - 25 * open
  const lidQuad: [number, number][] = [
    [83, 82],
    [105, 82],
    [109 - 3 * (1 - open), lidTopY],
    [88 - 1 * (1 - open), lidTopY - 1],
  ]

  const laptopBack: Layer = { mat: 'metal', shapes: P.laptop < 0.5 ? [Q(10, tuckedQuad, 0, 0.3, 0.6)] : [] }

  // asa: segura o notebook; quando digita, vem para frente e bate nas teclas
  const tap = P.typing ? (Math.floor(P.t * 9) % 2) * 2 : 0
  const wing: Layer = {
    mat: 'rubber',
    shapes:
      P.laptop < 0.5
        ? [
            E(3, 51, 64, 18, 10.5, -10),
            E(4, 34, 59.5, 9, 4.2, -28),
            E(5, 33, 65, 9, 3.8, -12),
            E(6, 35, 70.5, 7.5, 3.2, 4),
          ]
        : [
            E(3, 80, 66 + tap * 0.5, 15, 8, 18 + tap),
            E(4, 92, 72 + tap, 7, 3.5, 30 + tap * 2),
            E(5, 90, 75 + tap, 6, 3, 40 + tap * 2),
          ],
  }

  const head: Layer = {
    mat: 'rubber',
    shapes: [
      E(7, 74 + hx, 37 + hy, 20, 20),
      E(7, 85 + hx, 46 + hy, 9, 7),
      E(8, 72 + hx, 18 + hy, 3, 6.4, 24),
      E(8, 77 + hx, 20.5 + hy, 2.2, 4.4, 52),
    ],
  }

  const ob = P.beakOpen
  const beakLower: Layer = { mat: 'beak', shapes: [E(9, 93 + hx, 50.5 + hy + ob * 3, 8.5, 3.2, 8 + ob * 22)] }
  const beakUpper: Layer = { mat: 'beak', shapes: [E(11, 96 + hx, 45.5 + hy - ob, 12, 5, -5 - ob * 8)] }

  const laptopFront: Layer = {
    mat: 'metal',
    shapes: P.laptop >= 0.5 ? [Q(12, baseQuad, 0, -0.05, 0.62), Q(13, lidQuad, 0, 0.3, 0.6)] : [],
  }

  const layers =
    P.laptop < 0.5
      ? [body, laptopBack, wing, head, beakLower, beakUpper]
      : [body, head, beakLower, beakUpper, laptopFront, wing]
  return { layers, laptopQuad: P.laptop < 0.5 ? tuckedQuad : null, lidQuad: P.laptop >= 0.5 ? lidQuad : null, frontLid: null }
}

// ── buffers ─────────────────────────────────────────────────────────
const N = W * H
const col = new Int16Array(N) // índice de cor na tabela COLORS (-1 = vazio)
const part = new Int16Array(N) // parte (para linhas internas)
const layerIx = new Int8Array(N)
const tone = new Int8Array(N) // posição na rampa (para o reflexo)
const matIx = new Int8Array(N)

const COLOR_KEYS = [
  'y0', 'y1', 'y2', 'y3', 'y4', 'y5', 'o0', 'o1', 'o2', 'o3', 'm0', 'm1', 'm2', 'm3', 'm4',
  'ink', 'mouth', 'tongue', 'glow', 'rim', 'w0', 'w1', 'w2', 'w3', 'w4', 'white', 'black', 'shadow', 'wet',
] as const
const CI = Object.fromEntries(COLOR_KEYS.map((k, i) => [k, i])) as Record<(typeof COLOR_KEYS)[number], number>
const MAT_IX: Record<Mat, number> = { rubber: 0, beak: 1, metal: 2 }

function put(x: number, y: number, c: number) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  col[y * W + x] = c
}

/** desenha um sprite de strings (k preto, w branco, y/Y amarelos, etc.) */
function stamp(rows: string[], x0: number, y0: number, map: Record<string, number>, flipX = false) {
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      const c = map[ch]
      if (c === undefined) return
      put(flipX ? x0 + r.length - 1 - x : x0 + x, y0 + y, c)
    }),
  )
}

// óculos thug life em 3/4, desenhado em meia resolução: cada pixel do óculos vira um bloco 2x2,
// como no meme. Haste à esquerda, lente próxima com degraus, ponte e lente distante escorçada.
const GLASSES = [
  'kkkkkkkkkkkkkkkkkkkk',
  '....kkkkkkkkk.kkkkk.',
  '.....kwkwkkkk.kwkk..',
  '......kwkkkkk.kkk...',
  '........kkkkk..k....',
]

// óculos thug life de frente, idêntico à referência: barra em cima, duas lentes com degraus nas
// bordas de fora, brilhos em diagonal e a ponte vazada no meio. Blocos 2x2.
const GLASSES_FRONT = [
  'kkkkkkkkkkkkkkkkkkk',
  'kkwkwkkk...kkwkwkkk',
  '.kkwkkkk...kkkwkkk.',
  '..kkkkkk...kkkkkk..',
  '....kkkk...kkkk....',
]

let lastPond = true

export function render(P: Pose, pal: Pal, out: ImageData) {
  lastPond = P.pond
  const front = P.view === 'front'
  col.fill(-1)
  part.fill(-1)
  layerIx.fill(-1)
  tone.fill(0)
  matIx.fill(-1)

  const { layers, laptopQuad, lidQuad, frontLid } = buildLayers(P)
  const yMax = P.pond ? WATER + 1 : H
  const layerBox = layers.map((l) =>
    l.shapes.reduce<Box>(
      (b, s) => ({ x0: Math.min(b.x0, s.bb.x0), y0: Math.min(b.y0, s.bb.y0), x1: Math.max(b.x1, s.bb.x1), y1: Math.max(b.y1, s.bb.y1) }),
      { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 },
    ),
  )
  const baseY = 88
  const cx = 60

  // ── 1. formas sombreadas ──────────────────────────────────────────
  for (let y = 0; y < yMax; y++) {
    for (let x = 0; x < W; x++) {
      // pose global: squash a partir da base, pulo, inclinação, espelho
      let sx = P.flip ? W - 1 - x : x
      let sy = y
      sy = sy + P.jump - P.bob
      sx = cx + (sx - cx) / P.squashX + (baseY - sy) * P.lean
      sy = baseY + (sy - baseY) / P.squashY
      const px = sx + 0.5
      const py = sy + 0.5
      for (let li = layers.length - 1; li >= 0; li--) {
        const ly = layers[li]
        const lb = layerBox[li]
        if (px < lb.x0 || px > lb.x1 || py < lb.y0 || py > lb.y1) continue
        let found = false
        let bz = -1, bnx = 0, bny = 0, bnz = 0
        let bestPart = -1
        for (const s of ly.shapes) {
          const r = sample(s, px, py)
          if (r && (!found || r.z > bz)) {
            found = true
            bz = r.z
            bnx = r.nx
            bny = r.ny
            bnz = r.nz
            bestPart = s.part
          }
        }
        if (!found) continue
        const i = y * W + x
        let shade = bnx * L[0] + bny * L[1] + bnz * L[2]
        shade = shade * 0.62 + 0.42
        if (sy > WATER - 7 && ly.mat === 'rubber') shade -= 0.12 // sombra perto da água
        // luz do notebook aberto no peito e no bico
        if (P.glow > 0 && lidQuad && ly.mat !== 'metal') {
          const gd = Math.hypot(px - 86, py - 66)
          if (gd < 24) shade += (1 - gd / 24) * 0.25 * P.glow
        }
        // de frente: a tela ilumina o rosto e o peito por baixo
        if (P.glow > 0 && frontLid && ly.mat !== 'metal' && py < frontLid.top + 2) {
          const gd = Math.hypot((px - 60) * 0.8, py - frontLid.top)
          if (gd < 26) shade += (1 - gd / 26) * 0.3 * P.glow
        }
        const ramp = RAMPS[ly.mat]
        const th = THRESH[ly.mat]
        const sd = shade + bayer(x, y) * 0.07
        let t = 0
        while (t < th.length && sd > th[t]) t++
        col[i] = CI[ramp[t] as keyof typeof CI]
        tone[i] = t
        part[i] = bestPart
        layerIx[i] = li
        matIx[i] = MAT_IX[ly.mat]
        // brilho de borracha em cluster
        if (ly.mat === 'rubber' && shade > 0.98) col[i] = CI.y5
        if (ly.mat === 'metal') {
          const above = sample(ly.shapes[0], px, py - 1.5) || (ly.shapes[1] ? sample(ly.shapes[1], px, py - 1.5) : null)
          if (!above) col[i] = CI.m3 // aresta de cima acesa
        }
        break
      }
    }
  }

  // ── 2. contorno seletivo e linhas entre partes ───────────────────
  const outline = col.slice()
  for (let y = 0; y < yMax; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (col[i] < 0) continue
      const m = matIx[i]
      const empty = (dx: number, dy: number) => {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return true
        return col[yy * W + xx] < 0
      }
      const behind = (dx: number, dy: number) => {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return false
        const j = yy * W + xx
        return col[j] >= 0 && (layerIx[j] < layerIx[i] || (layerIx[j] === layerIx[i] && part[j] !== part[i] && part[j] < part[i]))
      }
      if (empty(1, 0) || empty(-1, 0) || empty(0, 1) || empty(0, -1)) {
        // contorno externo: tinta escura; no lado da luz, um tom mais escuro do próprio material
        const lit = empty(-1, 0) || empty(0, -1)
        if (m === 0) outline[i] = lit && !empty(0, 1) && !empty(1, 0) ? CI.y1 : CI.ink
        else if (m === 1) outline[i] = lit ? CI.o0 : CI.ink
        else outline[i] = CI.ink
        continue
      }
      if (behind(1, 0) || behind(-1, 0) || behind(0, 1) || behind(0, -1)) {
        outline[i] = m === 0 ? CI.y1 : m === 1 ? CI.o0 : CI.m0
        continue
      }
      // luz de borda fria do lado oposto à luz (2º pixel para dentro)
      if (m === 0 && (empty(2, 0) || empty(0, 2)) && !empty(-2, 0) && x > 60) outline[i] = CI.rim
    }
  }
  col.set(outline)

  // ── 3. detalhes pixel a pixel ─────────────────────────────────────
  const T = (x: number, y: number) => {
    // aplica a pose global ao contrário para posicionar carimbos
    const Y = baseY + (y - baseY) * P.squashY
    const X = cx + (x - cx - (baseY - Y) * P.lean) * P.squashX
    const sy = Y - P.jump + P.bob
    return [Math.round(P.flip ? W - 1 - X : X), Math.round(sy)] as const
  }
  const hx = P.headX
  const hy = P.headY

  if (front) {
    drawFrontDetails(P, T, frontLid!)
  } else {
  // boca aberta (interior)
  if (P.beakOpen > 0.25) {
    const [mx, my] = T(90 + hx, 49 + hy)
    const w = Math.round(6 + P.beakOpen * 4)
    for (let i = 0; i < w; i++) {
      const xx = P.flip ? mx - i : mx + i
      put(xx, my, CI.mouth)
      put(xx, my + 1, i > w / 2 ? CI.tongue : CI.mouth)
      if (P.beakOpen > 0.6) put(xx, my + 2, CI.mouth)
    }
  }

  // notebook: detalhes da tampa (fresta, adesivo) ou da tela aberta
  if (laptopQuad) {
    // espessura (2 linhas escuras embaixo) e a fresta entre tampa e base
    for (let y = 0; y < WATER; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (part[i] !== 10 || col[i] === CI.ink) continue
        const below2 = part[(y + 2) * W + x] !== 10 || col[(y + 2) * W + x] === CI.ink
        const below4 = part[(y + 4) * W + x] !== 10 || col[(y + 4) * W + x] === CI.ink
        if (below2) col[i] = CI.m1
        else if (below4 && !below2) col[i] = (x + y) % 2 ? CI.m0 : CI.m1
      }
    const [sx, sy] = T(laptopQuad[2][0] - 9, laptopQuad[2][1] - 6)
    const sticker = ['.yy.', 'yYYy', 'yYYy', '.yy.']
    sticker.forEach((r, yy) =>
      [...r].forEach((ch, xx) => {
        const X = P.flip ? sx - xx : sx + xx
        const idx = (sy + yy) * W + X
        if (ch !== '.' && col[idx] >= CI.m0 && col[idx] <= CI.m4) put(X, sy + yy, ch === 'y' ? CI.y2 : CI.y3)
      }),
    )
  }
  if (lidQuad) {
    // adesivo nas costas da tampa + teclas na base + brilho da tela vazando pela borda
    const [sx, sy] = T(95, 67)
    stamp(['.yy.', 'yYYy', 'yYYy', '.yy.'], sx - (P.flip ? 3 : 0), sy, { y: CI.y2, Y: CI.y3 }, P.flip)
    for (let k = 0; k < 6; k++) {
      const [kx, ky] = T(89 + k * 3, 81)
      put(kx, ky, CI.m1)
      if (P.typing && (Math.floor(P.t * 12) + k) % 4 === 0) put(kx, ky - 1, CI.glow)
    }
    for (let yy = 60; yy < 79; yy++) {
      const [gx, gy] = T(86 - Math.round((79 - yy) * 0.1) - 1, yy)
      if ((yy + Math.floor(P.t * 6)) % 3 !== 0) put(gx, gy, CI.glow)
    }
  }

  // olhos (aparecem quando o óculos sobe): redondos e pretos
  if (P.glassLift > 0.35) {
    const [ex, ey] = T(79 + hx, 33 + hy)
    stamp(['.kkk.', 'kkkkk', 'kkkkk', 'kkkkk', '.kkk.'], ex - (P.flip ? 4 : 0), ey, { k: CI.black }, P.flip)
    const [fx, fy] = T(91 + hx, 34 + hy)
    stamp(['kk', 'kkk', 'kkk', 'kk'], fx - (P.flip ? 2 : 0), fy, { k: CI.black }, P.flip)
  }

  // sobrancelhas acima do óculos (dão a expressão mesmo com o óculos no rosto)
  const lift = Math.round(P.glassLift * 14)
  const browY = 26 + hy - (P.brow === 'up' ? 2 : 0) - Math.round(P.glassLift * 3)
  const browRows: Record<Pose['brow'], string[]> = {
    none: ['yyyyyy'],
    smug: ['....yy', 'yyyy..'],
    up: ['.yyyy.', 'y....y'],
    angry: ['yyy...', '...yyy'],
  }
  {
    const [bx, by] = T(74 + hx, browY - (P.brow === 'smug' ? 1 : 0))
    stamp(browRows[P.brow], bx - (P.flip ? 5 : 0), by, { y: CI.y1 }, P.flip)
    const farBrow = P.brow === 'angry' ? ['yyy.', '...y'] : P.brow === 'up' ? ['.yy.', 'y..y'] : ['yyy']
    const [fx, fy] = T(91 + hx, browY + 1)
    stamp(farBrow, fx - (P.flip ? farBrow[0].length - 1 : 0), fy, { y: CI.y1 }, P.flip)
  }

  // óculos thug life (blocos 2x2)
  {
    const [gx, gy] = T(64 + hx, 29 + hy - lift)
    const gw = GLASSES[0].length * 2
    GLASSES.forEach((row, ry) =>
      [...row].forEach((ch, rx) => {
        if (ch === '.') return
        let c = ch === 'w' ? CI.white : CI.black
        // brilho que varre a lente próxima
        if (ch === 'k' && P.glint > 0 && P.glint < 1 && ry >= 1) {
          const band = 4 + P.glint * 10
          if (Math.abs(rx - ry - band) < 0.8) c = CI.white
        }
        for (let by = 0; by < 2; by++)
          for (let bx = 0; bx < 2; bx++) {
            const X = rx * 2 + bx
            put(P.flip ? gx - X : gx + X, gy + ry * 2 + by, c)
          }
      }),
    )
    void gw
  }
  }

  // patas laterais (fora da água): duas pernas curtas e pés de pato alternando o passo
  if (!front && (P.legs ?? 0) > 0) drawSideLegs(P, T)

  // gotinhas no corpo: ele acabou de sair da lagoa
  if ((P.wet ?? 0) > 0.05) drawWetBody(P, T, front)

  // ── 4. água: reflexo ondulado, faixas de luz e anéis ──────────────
  for (let y = WATER + 1; P.pond && y < H; y++) {
    const depth = (y - WATER) / (H - WATER)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!P.pond) {
        col[i] = -1
        continue
      }
      // a água some nas laterais com dither
      const edge = Math.abs(x - 62) / 62
      if (edge + bayer(x, y) * 0.35 > 0.9 - depth * 0.25) {
        col[i] = -1
        continue
      }
      let c = depth < 0.15 ? CI.w2 : depth < 0.55 ? CI.w1 : CI.w0
      // reflexo do pato, ondulado e um tom mais escuro
      const wob = Math.round(Math.sin(y * 0.9 + P.t * 3.2) * (1 + depth))
      const sy2 = WATER - (y - WATER) + 1
      const sx2 = x + wob
      if (sx2 >= 0 && sx2 < W && sy2 >= 0) {
        const j = sy2 * W + sx2
        if (col[j] >= 0 && (y - WATER) % 2 === 1 && depth < 0.8 && (depth < 0.35 || bayer(x, y) < 0.1)) {
          const m = matIx[j]
          if (m === 0) c = tone[j] >= 3 ? CI.y1 : CI.y0
          else if (m === 1) c = CI.o0
          else if (m === 2) c = CI.m1
          else c = CI.w0
        }
      }
      // faixas de luz correndo na superfície
      const band = Math.sin(x * 0.42 - P.t * 1.6 + y * 1.7) + Math.sin(x * 0.13 + P.t * 0.7)
      if (band > 1.55 && y % 2 === 0) c = CI.w3
      col[i] = c
    }
  }
  // linha d'água: borda clara onde o pato toca
  for (let x = 0; x < W; x++) {
    const i = WATER * W + x
    if (P.pond && col[i] >= 0 && col[(WATER + 1) * W + x] >= 0 && (x + Math.floor(P.t * 4)) % 3 !== 0)
      col[(WATER + 1) * W + x] = CI.w4
  }
  // anéis
  for (const r of P.ripples) {
    if (!P.pond) break
    const rx = 30 + r.age * 40
    const ry = 3 + r.age * 5
    const steps = Math.round(rx * 4)
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI
      const x = Math.round(62 + Math.cos(a) * rx)
      const y = Math.round(WATER + 2 + Math.sin(a) * ry)
      if (y > WATER && y < H && x >= 0 && x < W && col[y * W + x] >= 0 && bayer(x, y) + 0.5 < r.strength * (1 - r.age)) put(x, y, CI.w4)
    }
  }
  // respingos
  for (const d of P.splash) put(Math.round(d.x), Math.round(d.y), d.age < 0.3 ? CI.white : CI.w4)

  // ── 5. para a imagem ─────────────────────────────────────────────
  const data = out.data
  for (let i = 0; i < N; i++) {
    const c = col[i]
    const o = i * 4
    if (c < 0) {
      data[o + 3] = 0
      continue
    }
    const rgb = pal[COLOR_KEYS[c]]
    data[o] = rgb[0]
    data[o + 1] = rgb[1]
    data[o + 2] = rgb[2]
    data[o + 3] = 255
  }
}

/** pixel opaco do pato (para o clique) */
export function hit(x: number, y: number) {
  if (x < 0 || y < 0 || x >= W || y >= H || (lastPond && y > WATER)) return false
  return col[y * W + x] >= 0
}

// ═════════════════════════════════════════════════════════════════
// Detalhes da vista de frente, patas e gotas
// ═════════════════════════════════════════════════════════════════
type Tf = (x: number, y: number) => readonly [number, number]

function putIfEmpty(x: number, y: number, c: number) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  if (col[y * W + x] < 0) col[y * W + x] = c
}

/** carimba com contorno de tinta automático em volta (como o resto do pato) */
function stampOutlined(rows: string[], x0: number, y0: number, map: Record<string, number>, behind = false) {
  const px: [number, number, number][] = []
  rows.forEach((r, y) => [...r].forEach((ch, x) => map[ch] !== undefined && px.push([x0 + x, y0 + y, map[ch]])))
  const set = new Set(px.map(([x, y]) => y * 1000 + x))
  for (const [x, y] of px)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (y + dy) * 1000 + x + dx
      if (!set.has(k)) putIfEmpty(x + dx, y + dy, CI.ink)
    }
  for (const [x, y, c] of px) (behind ? putIfEmpty : put)(x, y, c)
}

function drawFrontDetails(P: Pose, T: Tf, lid: { x0: number; x1: number; top: number; bottom: number }) {
  const hx = P.headX
  const hy = P.headY
  const lift = Math.round(P.glassLift * 14)

  // boca aberta
  if (P.beakOpen > 0.25) {
    const [mx, my] = T(55 + hx, 54 + hy)
    for (let i = 0; i < 11; i++) {
      put(mx + i, my, CI.mouth)
      if (P.beakOpen > 0.5) put(mx + i, my + 1, i > 3 && i < 8 ? CI.tongue : CI.mouth)
    }
  }

  // olhos redondos (quando o óculos sobe)
  if (P.glassLift > 0.35) {
    const eye = ['.kkk.', 'kkkkk', 'kkkkk', 'kkkkk', '.kkk.']
    for (const ex of [49, 67]) {
      const [x, y] = T(ex + hx, 37 + hy)
      stamp(eye, x, y, { k: CI.black })
    }
  }

  // sobrancelhas, espelhadas
  const browY = 31 + hy - (P.brow === 'up' ? 2 : 0) - Math.round(P.glassLift * 3)
  const left: Record<Pose['brow'], string[]> = {
    none: ['.yyyy'],
    smug: ['yy...', '..yyy'],
    up: ['..yyy', '.y...'],
    angry: ['yy...', '..yyy'],
  }
  const right: Record<Pose['brow'], string[]> = {
    none: ['yyyy.'],
    smug: ['yyyy.'],
    up: ['yyy..', '...y.'],
    angry: ['...yy', 'yyy..'],
  }
  {
    const [lx, ly] = T(46 + hx, browY)
    stamp(left[P.brow], lx, ly, { y: CI.y1 })
    const [rx, ry] = T(69 + hx, browY - (P.brow === 'smug' ? 1 : 0))
    stamp(right[P.brow], rx, ry, { y: CI.y1 })
  }

  // óculos de frente
  {
    const [gx, gy] = T(41 + hx, 34 + hy - lift)
    GLASSES_FRONT.forEach((row, ry) =>
      [...row].forEach((ch, rx) => {
        if (ch === '.') return
        let c = ch === 'w' ? CI.white : CI.black
        if (ch === 'k' && P.glint > 0 && P.glint < 1 && ry >= 1) {
          const band = P.glint * 22 - 2
          if (Math.abs(rx - ry - band) < 0.8) c = CI.white
        }
        for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) put(gx + rx * 2 + bx, gy + ry * 2 + by, c)
      }),
    )
  }

  // notebook no colo: adesivo nas costas da tampa, luz da tela vazando por cima
  const lidH = lid.bottom - lid.top
  if (lidH > 10) {
    const [sx, sy] = T(58, lid.top + Math.round(lidH / 2) - 2)
    stamp(['.yy.', 'yYYy', 'yYYy', '.yy.'], sx, sy, { y: CI.y2, Y: CI.y3 })
  }
  if (lidH > 8 && P.glow > 0) {
    const f = Math.floor(P.t * 8)
    for (let x = lid.x0 + 2; x < lid.x1 - 1; x++) {
      const [gx, gy] = T(x, lid.top - 1)
      const i = gy * W + gx
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue
      if (matIx[i] === 0) col[i] = (x + f) % 3 === 0 ? CI.glow : CI.y4
      const [hx2, hy2] = T(x, lid.top - 2)
      const j = hy2 * W + hx2
      if (hy2 >= 0 && matIx[j] === 0 && (x + f) % 2 === 0) col[j] = CI.y4
    }
  }

  // pés de pato para a frente, sentado: leque palmado com três dedos e dobras da membrana
  const foot = [
    '......oooo.......',
    '....oohhhoo......',
    '..ooohhhooooo....',
    '.oooOoohoooOooo..',
    'ooOooooOooooOoooo',
    '.OOOO.OOOOO.OOOO.',
  ]
  const fmap = { o: CI.o2, h: CI.o3, O: CI.o1, d: CI.o0 }
  // dedos abrindo para fora: o pé esquerdo é o espelho do direito
  const [lx, ly] = T(27, GROUND - 5)
  stampOutlined(foot.map((r) => [...r].reverse().join('')), lx, ly, fmap)
  const [rx, ry] = T(76, GROUND - 5)
  stampOutlined(foot, rx, ry, fmap)
}

// Pé de pato palmado, de lado (dedos para a direita), em proporção com o corpo (~1/4 do
// comprimento): canela grossa, pé em cunha com o dorso iluminado, dobras da membrana e três
// dedos separados na ponta; o dedinho de trás (hálux) aparece no calcanhar.
// h = luz, o = laranja, O = sombra, d = membrana escura.
const FOOT_SIDE = [
  '...oooo...........',
  '..ohhhoo..........',
  '..ohhhooooo.......',
  '.oohhoooooooooo...',
  'OooooOooooOoooooo.',
  '.OOO.OOOOO.OOOO.OO',
]
// no ar a membrana dobra: pé mais curto, dedos juntos e um pouco caídos
const FOOT_SIDE_UP = [
  '...oooo.....',
  '..ohhhoo....',
  '.oohhoooooo.',
  'OoooOoooOooo',
  '.OOO.OOO.OO.',
]
// canela: 4 px de largura, sombra atrás e luz na frente
const SHIN = 'Ooho'

function drawSideLegs(P: Pose, T: Tf) {
  const phase = (P.stride ?? 0) * Math.PI * 2
  const moving = P.stride !== undefined
  // pernas recuadas no corpo, como num pato de verdade (daí o gingado)
  const legs = [
    { lx: 44, ph: phase + Math.PI, near: false },
    { lx: 56, ph: phase, near: true },
  ]
  for (const L of legs) {
    const off = moving ? Math.round(Math.cos(L.ph) * 5) : 0
    const up = moving && Math.sin(L.ph) > 0.15 ? Math.round(Math.sin(L.ph) * 3) : 0
    const rows = up > 0 ? FOOT_SIDE_UP : FOOT_SIDE
    const fw = rows[0].length
    const shinCol = rows[0].indexOf('o')
    const [bx] = T(L.lx + off, GROUND)
    const shinX = P.flip ? bx - 3 : bx
    const footX = P.flip ? shinX - (fw - shinCol - 4) : shinX - shinCol
    const footTop = GROUND - rows.length + 1 - up
    // canela sobe até encostar no corpo
    let shinH = 0
    for (let y = footTop - 1; y > footTop - 10; y--) {
      const probe = y * W + shinX + 1
      if (col[probe] >= 0 && matIx[probe] === 0) break
      shinH++
    }
    const map = L.near ? { o: CI.o2, h: CI.o3, O: CI.o1, d: CI.o0 } : { o: CI.o1, h: CI.o2, O: CI.o0, d: CI.o0 }
    const flipRow = (r: string) => (P.flip ? [...r].reverse().join('') : r)
    const shinRow = flipRow(SHIN)
    const all: string[] = []
    for (let k = 0; k < shinH; k++) all.push('.'.repeat(shinX - footX) + shinRow)
    for (const r of rows) all.push(flipRow(r))
    stampOutlined(all, footX, footTop - shinH, map, !L.near)
  }
}

function drawWetBody(P: Pose, T: Tf, front: boolean) {
  const wet = P.wet ?? 0
  const spots = front
    ? [[36, 76], [46, 84], [74, 85], [84, 77], [52, 30], [70, 32], [60, 88]]
    : [[30, 62], [40, 80], [55, 86], [72, 82], [24, 54], [84, 72], [66, 60]]
  const n = Math.min(spots.length, Math.ceil(spots.length * Math.min(1, wet)))
  for (let k = 0; k < n; k++) {
    // a gota escorre devagar e volta (ciclo de cada uma com fase própria)
    const slide = Math.floor((P.t * 3 + k * 1.7) % 4)
    const [x, y] = T(spots[k][0], spots[k][1] + slide)
    const i = y * W + x
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || matIx[i] !== 0) continue
    put(x, y, CI.rim)
    put(x, y - 1, CI.white)
  }
}

export const PAL_KEYS = COLOR_KEYS
