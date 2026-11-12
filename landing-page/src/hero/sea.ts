/*
 * Mar de código do hero: fileiras de código, caracteres e pull requests que ondulam como água,
 * com o Squeak boiando nelas. Pato e água são um sistema só:
 *
 *  - a superfície é uma soma de ondas (com deslocamento horizontal, que afia as cristas) mais
 *    anéis de ondulação que nascem do cursor, do pato e dos respingos;
 *  - cada fileira é uma "linha" do mar em perspectiva: as do fundo são menores, mais lentas e
 *    mais apagadas; cada caractere acompanha a altura e a inclinação da onda onde está;
 *  - o pato tem física de boia (mola amortecida): segue a altura e a inclinação da água embaixo
 *    do casco, afunda quando apertado e devolve a energia em anéis e respingos de caracteres;
 *  - as fileiras da frente passam por cima do casco: a parte de baixo fica submersa.
 */

export type SeaOptions = {
  duckSrc: string
  reduced: boolean
  /** chamado quando o pato é apertado (som, balão) */
  onPoke?: () => void
}

type Kind = 'base' | 'kw' | 'str' | 'num' | 'com' | 'ok' | 'xp' | 'tag'
/** um bloco de até 3 caracteres: a unidade que sobe, desce e inclina com a onda */
type Glyph = { ch: string; x: number; w: number; kind: Kind }
type Chip = { text: string; x: number; w: number; kind: 'merged' | 'open' | 'xp' }
type Row = {
  d: number // profundidade 0 (horizonte) … 1 (frente)
  y: number
  font: number
  cw: number
  len: number
  speed: number
  glyphs: Glyph[]
  chips: Chip[]
  off: number
}
type Ring = { x: number; d: number; t0: number; amp: number }
type Drop = { ch: string; x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; color: string; size: number }

// "@merged:…", "@open:…" e "@xp:…" viram chips (pull requests e XP boiando)
const LINES = [
  'git merge feat/login @merged:#42_merged',
  'const team = await squeak.connect()',
  'fix: null check no login @open:#51_review',
  "kanban.move(card, 'done') @xp:+120_XP",
  'export function ship(pr) { return merge(pr) }',
  '// funciona na minha máquina',
  'git push origin main ✓',
  "call.join('#daily') <squeak/>",
  'if (approved) xp += 120 @merged:#58_merged',
  'review(pr).then(approve) @open:#63_open',
  'import { time } from "squeak"',
  'git rebase main @xp:+50_XP',
  'await deploy({ env: "prod" }) ✓',
  'feat: reputação por contribuição',
]
const KEYWORDS = new Set(['const', 'await', 'export', 'function', 'return', 'import', 'from', 'if', 'git', 'fix:', 'feat:'])
const SPLASH = ['{', '}', ';', '#', '+', '<', '/>', '=', '✓', '()', '0', '1', '=>']

/** Ondas de fundo: amplitude (px), comprimento (px), fase extra por profundidade (o swell vem do fundo). */
const WAVES = [
  { a: 11, l: 430, dph: 2.4, dir: -1 },
  { a: 5.6, l: 236, dph: 4.1, dir: -1 },
  { a: 3, l: 128, dph: 6.3, dir: 1 },
  { a: 1.5, l: 67, dph: 9.5, dir: -1 },
].map((w) => {
  const k = (Math.PI * 2) / w.l
  // dispersão de água funda: ondas longas correm mais (ω² = g·k), em escala de tela
  return { ...w, k, w: Math.sqrt(520 * k) }
})

const RING_SPEED = 150
const RING_LIFE = 3.2

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export function createSea(canvas: HTMLCanvasElement, opt: SeaOptions) {
  const ctx = canvas.getContext('2d')!
  const img = new Image()
  img.decoding = 'async'
  img.src = opt.duckSrc
  let imgOk = false
  img.onload = () => {
    imgOk = true
    buildDuckSprite()
    if (!running) frame(performance.now())
  }

  let W = 0
  let H = 0
  let dpr = 1
  let rows: Row[] = []
  // mais fileiras = mar mais denso; em tela pequena, menos (cabe menos e o celular agradece)
  let ROWS = 16
  let DUCK_ROW = 7
  let rings: Ring[] = []
  let drops: Drop[] = []
  let running = false
  let raf = 0
  let last = 0
  let t = opt.reduced ? 2.4 : 0
  let pal = readPalette()

  // qualidade adaptativa: se os quadros ficarem lentos, baixa a resolução e depois vai a 30 fps
  const quality = { maxDpr: 1.75, half: false, slow: 0, fast: 0, skip: false }

  // pato (boia)
  const duck = { x: 0, y: 0, vy: 0, ang: 0, va: 0, size: 0, lift: 0, ready: false }
  let lastPointer = { x: -999, y: -999 }
  let nextWake = 0

  function css(name: string) {
    return getComputedStyle(canvas).getPropertyValue(name).trim()
  }
  function rgb(color: string): [number, number, number] {
    ctx.fillStyle = '#000'
    ctx.fillStyle = color
    const v = String(ctx.fillStyle)
    if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]
    const m = v.match(/[\d.]+/g) ?? ['0', '0', '0']
    return [+m[0], +m[1], +m[2]]
  }
  function mix(a: [number, number, number], b: [number, number, number], k: number) {
    return `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`
  }
  function readPalette() {
    const bg = rgb(css('--bg') || '#0f1420')
    const blue = rgb(css('--pond-blue') || '#4da3ff')
    const text = rgb(css('--text') || '#f2f4f8')
    const light = bg[0] + bg[1] + bg[2] > 380
    const ink = light ? rgb(css('--link') || '#1f6fd1') : blue
    return {
      light,
      water: mix(bg, blue, light ? 0.22 : 0.27),
      deep: mix(bg, blue, light ? 0.3 : 0.2),
      foam: light ? mix(ink, bg, 0.1) : mix(text, blue, 0.12),
      kinds: {
        base: mix(ink, light ? text : text, light ? 0.12 : 0.12),
        kw: css('--code-keyword') || '#c792ff',
        str: css('--code-string') || '#3ddc97',
        num: css('--yellow-text') || '#ffc83d',
        com: mix(rgb(css('--text-secondary') || '#9aa3b5'), ink, 0.45),
        ok: css('--success-text') || '#3ddc97',
        xp: css('--orange-text') || '#ff8a3d',
        tag: css('--yellow-text') || '#ffc83d',
      } as Record<Kind, string>,
      chip: {
        merged: css('--code-keyword') || '#c792ff',
        open: css('--success-text') || '#3ddc97',
        xp: css('--orange-text') || '#ff8a3d',
      },
      chipBg: mix(bg, blue, light ? 0.08 : 0.2),
      yellow: css('--duck-yellow') || '#ffc83d',
    }
  }

  /*
   * Desempenho: desenhar ~1000 caracteres rotacionados com fillText por quadro é caro (cada um é
   * rasterizado de novo). Cada (caractere, cor, tamanho) é desenhado uma vez num carimbo e depois
   * só copiado com drawImage, que é barato tanto em GPU quanto em software.
   */
  type Stamp = { c: HTMLCanvasElement; ox: number; oy: number }
  let stamps = new Map<string, Stamp>()
  function stamp(ch: string, fill: string, font: number): Stamp {
    const key = font + fill + ch
    let s = stamps.get(key)
    if (!s) {
      const px = font * dpr
      const c = document.createElement('canvas')
      c.width = Math.ceil(px * 0.6 * ch.length + 6)
      c.height = Math.ceil(px * 1.5)
      const g = c.getContext('2d')!
      g.font = `500 ${px}px "JetBrains Mono", ui-monospace, monospace`
      g.fillStyle = fill
      g.textBaseline = 'alphabetic'
      g.fillText(ch, 3, px * 1.08)
      s = { c, ox: -3 - (px * 0.6 * ch.length) / 2, oy: -px * 1.08 } // origem no meio do bloco
      stamps.set(key, s)
    }
    return s
  }

  function kindOf(tok: string, inComment: boolean): Kind {
    if (inComment) return 'com'
    if (KEYWORDS.has(tok)) return 'kw'
    if (tok === '✓') return 'ok'
    if (tok === '<squeak/>') return 'tag'
    if (/['"][^'"]*['"]/.test(tok)) return 'str'
    if (/^\d+$/.test(tok)) return 'num'
    return 'base'
  }

  function buildRows() {
    rows = []
    ROWS = W < 520 ? 11 : 16
    // caracteres por bloco: 1 dobra mais bonito, 3 custa um terço e quase não se nota (4 no celular)
    const CHUNK = W < 520 ? 4 : 3
    DUCK_ROW = Math.round(ROWS * 0.44)
    const top = H * 0.423
    const depth = H * 0.5 // o mar continua por trás do card de eventos (vidro fosco)
    for (let i = 0; i < ROWS; i++) {
      const d = i / (ROWS - 1)
      const font = Math.round(lerp(8, 17, Math.pow(d, 1.2)) * clamp(W / 620, 0.72, 1.1) * 10) / 10
      const cw = font * 0.6
      const row: Row = {
        d,
        y: top + depth * Math.pow(d, 1.4),
        font,
        cw,
        len: 0,
        // correntes: fileiras vizinhas correm em velocidades diferentes (os caracteres passam uns pelos outros)
        speed: lerp(8, 30, d) * (i % 3 === 1 ? 1.5 : i % 3 === 2 ? 0.7 : 1),
        glyphs: [],
        chips: [],
        off: (i * 137.5) % 400,
      }
      // enche a fileira com linhas de código até passar bem da largura (depois ela dá a volta)
      let x = 0
      let li = (i * 5) % LINES.length
      const need = W * 1.5 + 600
      while (x < need) {
        let comment = false
        for (const tok of LINES[li % LINES.length].split(' ')) {
          if (tok[0] === '@') {
            const [kind, label] = tok.slice(1).split(':')
            const text = label.replace(/_/g, ' ')
            const w = (text.length + 2.2) * cw
            row.chips.push({ text, x, w, kind: kind as Chip['kind'] })
            x += w + cw
            continue
          }
          if (tok === '//') comment = true
          const kind = kindOf(tok, comment)
          for (let c = 0; c < tok.length; c += CHUNK) {
            const ch = tok.slice(c, c + CHUNK)
            row.glyphs.push({ ch, x, w: ch.length * cw, kind })
            x += ch.length * cw
          }
          x += cw
        }
        x += cw * 3
        li++
      }
      row.len = x
      rows.push(row)
    }
  }

  /** Superfície na fileira `row`, no x de tela: devolve altura (y+ = baixo), deslocamento em x e inclinação. */
  const S = { h: 0, dx: 0, slope: 0 }
  function surface(x: number, row: Row) {
    const amp = lerp(0.34, 1.12, row.d)
    const persp = lerp(0.52, 1.12, row.d)
    const xr = (x - W / 2) / persp
    let h = 0
    let dx = 0
    let slope = 0
    for (const wv of WAVES) {
      const th = wv.k * xr * wv.dir - wv.w * t + wv.dph * row.d
      const s = Math.sin(th)
      const c = Math.cos(th)
      h += wv.a * s
      dx += wv.a * 0.95 * c * wv.dir // órbita quase circular, como partícula de água
      slope += (wv.a * wv.k * c * wv.dir) / persp
    }
    h *= amp
    dx *= amp
    slope *= amp
    // anéis: frente de onda que se expande a partir de cada perturbação
    for (const r of rings) {
      const age = t - r.t0
      if (age <= 0) continue
      const ddx = x - r.x
      if (ddx > 560 || ddx < -560) continue
      const ddy = (row.d - r.d) * 520
      const dist = Math.sqrt(ddx * ddx + ddy * ddy)
      const front = dist - age * RING_SPEED
      if (front > 70 || front < -210) continue
      const env = Math.exp(-(front * front) / (front > 0 ? 900 : 9000)) * Math.exp(-age * 1.15) * r.amp
      const ph = front * 0.085
      h += env * Math.sin(ph)
      slope += env * 0.085 * Math.cos(ph) * (dist > 1 ? ddx / dist : 0)
    }
    S.h = h
    S.dx = dx
    S.slope = slope
    return S
  }

  function ring(x: number, d: number, amp: number) {
    rings.push({ x, d, t0: t, amp })
    if (rings.length > 14) rings.shift()
  }

  function layoutDuck() {
    duck.size = Math.min(H * 0.507, W * 0.5)
    duck.x = W * 0.5
    duck.ready = false
    buildDuckSprite()
  }

  function stepDuck(dt: number) {
    const row = rows[DUCK_ROW]
    const cx = W * 0.5 + Math.sin(t * 0.21) * W * 0.035 + Math.sin(t * 0.53) * 4
    const half = duck.size * 0.3
    let hSum = 0
    for (let i = -2; i <= 2; i++) hSum += surface(cx + (i / 2) * half, row).h
    const hL = surface(cx - half, row).h
    const hR = surface(cx + half, row).h
    const targetY = row.y - row.font * 0.9 + hSum / 5
    const targetA = Math.atan2(hR - hL, half * 2) * 1.15 + Math.sin(t * 0.8) * 0.012
    if (!duck.ready) {
      duck.y = targetY
      duck.ang = targetA
      duck.ready = true
    }
    // boia: mola amortecida (a água empurra de volta, a massa do pato atrasa um pouco)
    duck.vy += ((targetY - duck.y) * 46 - duck.vy * 6.2) * dt
    duck.y += duck.vy * dt
    duck.va += ((targetA - duck.ang) * 38 - duck.va * 5.4) * dt
    duck.ang += duck.va * dt
    duck.x = cx
    // nadar deixa esteira: pequenos anéis saindo da popa
    if (t > nextWake) {
      ring(duck.x - duck.size * 0.34, row.d + 0.02, 2.2 + Math.abs(duck.vy) * 0.02)
      nextWake = t + 0.85 + Math.random() * 0.5
    }
  }

  /*
   * O pato é pré-renderizado uma vez no tamanho final, já cortado na linha d'água (com a borda de
   * baixo esfumada). Por quadro sobra só uma cópia 1:1 levemente girada: redimensionar a arte de
   * 900px e recortar por um polígono a cada quadro era o maior custo fixo da cena.
   */
  let duckSprite: HTMLCanvasElement | null = null
  const WATERLINE = 0.8 // fração da altura da arte que fica acima da água
  function buildDuckSprite() {
    if (!imgOk || !duck.size) return
    const s = duck.size * dpr
    const w = s * (img.naturalWidth / img.naturalHeight)
    const cut = s * (WATERLINE + 0.035)
    const c = document.createElement('canvas')
    c.width = Math.ceil(w)
    c.height = Math.ceil(cut)
    const g = c.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, 0, 0, w, s)
    // não existe "água" desenhada: o casco some abaixo da linha da onda
    const fade = g.createLinearGradient(0, cut - s * 0.05, 0, cut)
    fade.addColorStop(0, 'rgba(0,0,0,0)')
    fade.addColorStop(1, 'rgba(0,0,0,1)')
    g.globalCompositeOperation = 'destination-out'
    g.fillStyle = fade
    g.fillRect(0, cut - s * 0.05, w, s * 0.05 + 1)
    duckSprite = c
  }
  function drawDuck() {
    if (!duckSprite) return
    const cs = Math.cos(duck.ang)
    const sn = Math.sin(duck.ang)
    ctx.setTransform(cs, sn, -sn, cs, duck.x * dpr, duck.y * dpr)
    ctx.globalAlpha = 1
    ctx.drawImage(duckSprite, -duckSprite.width / 2, -duck.size * dpr * WATERLINE)
  }

  /** o mar some nas laterais (feito aqui, por caractere, em vez de máscara CSS recalculada a cada quadro) */
  function edgeFade(x: number) {
    const e = W * 0.17
    return clamp(Math.min(x, W - x) / e, 0, 1)
  }

  function drawRow(row: Row) {
    const pad = 40
    // profundidade só por tamanho e opacidade; as últimas fileiras somem para baixo
    const baseAlpha = lerp(0.34, 1, Math.pow(row.d, 0.75)) * clamp((1.04 - row.d) / 0.2, 0, 1)
    const scroll = (t * row.speed + row.off) % row.len
    const ampMax = 16 * lerp(0.34, 1.12, row.d)
    for (const g of row.glyphs) {
      let x = g.x - scroll + g.w / 2
      if (x < -pad) x += row.len
      if (x > W + pad) continue
      const s = surface(x, row)
      const crest = clamp(0.5 - s.h / (2 * ampMax), 0, 1) // 1 = crista
      const fill = crest > 0.86 && g.kind === 'base' ? pal.foam : pal.kinds[g.kind]
      ctx.globalAlpha = baseAlpha * (0.5 + 0.5 * crest) * edgeFade(x)
      // inclinação pequena: cos ≈ 1 e sin ≈ tan (evita atan/cos/sin por caractere)
      const sl = clamp(s.slope, -0.7, 0.7)
      const st = stamp(g.ch, fill, row.font)
      ctx.setTransform(1, sl, -sl, 1, (x + s.dx) * dpr, (row.y + s.h) * dpr)
      ctx.drawImage(st.c, st.ox, st.oy)
    }
    ctx.font = `500 ${row.font * dpr}px "JetBrains Mono", ui-monospace, monospace`
    // pull requests e XP boiando: chips que sobem e inclinam com a onda
    for (const c of row.chips) {
      let x = c.x - scroll
      if (x < -pad - c.w) x += row.len
      if (x > W + pad) continue
      const s = surface(x + c.w / 2, row)
      const a = Math.atan(s.slope)
      const cs = Math.cos(a) * dpr
      const sn = Math.sin(a) * dpr
      ctx.setTransform(cs, sn, -sn, cs, (x + c.w / 2 + s.dx) * dpr, (row.y + s.h - row.font * 0.32) * dpr)
      const hgt = row.font * 1.5
      ctx.globalAlpha = baseAlpha * 0.92 * edgeFade(x + c.w / 2)
      ctx.fillStyle = pal.chipBg
      ctx.strokeStyle = pal.chip[c.kind]
      ctx.lineWidth = Math.max(1, row.font * 0.07) * dpr
      ctx.beginPath()
      ctx.roundRect((-c.w / 2) * dpr, (-hgt / 2) * dpr, c.w * dpr, hgt * dpr, (hgt / 2) * dpr)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = pal.chip[c.kind]
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(c.text, 0, row.font * 0.06 * dpr)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
    ctx.globalAlpha = 1
  }

  function stepDrops(dt: number) {
    for (const p of drops) {
      p.vy += 900 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
      p.life -= dt
    }
    drops = drops.filter((p) => p.life > 0 && p.y < H + 30)
  }
  function drawDrops() {
    ctx.textAlign = 'center'
    for (const p of drops) {
      const cs = Math.cos(p.rot) * dpr
      const sn = Math.sin(p.rot) * dpr
      ctx.setTransform(cs, sn, -sn, cs, p.x * dpr, p.y * dpr)
      ctx.globalAlpha = clamp(p.life * 1.6, 0, 1)
      ctx.fillStyle = p.color
      ctx.font = `700 ${p.size * dpr}px "JetBrains Mono", ui-monospace, monospace`
      ctx.fillText(p.ch, 0, 0)
    }
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < DUCK_ROW; i++) drawRow(rows[i])
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    drawDuck()
    for (let i = DUCK_ROW; i < ROWS; i++) drawRow(rows[i])
    drawDrops()
  }

  function frame(now: number) {
    // no máximo ~60 quadros/s (30 em tela pequena, estável): o movimento é por tempo, então a
    // velocidade do mar é a mesma em qualquer taxa de quadros
    if (running && now - last < (W < 520 ? 31 : 14.5)) {
      raf = requestAnimationFrame(frame)
      return
    }
    if (running && quality.half) {
      quality.skip = !quality.skip
      if (quality.skip) {
        raf = requestAnimationFrame(frame)
        return
      }
    }
    const raw = now - last
    const dt = Math.min(0.05, raw / 1000 || 0.016)
    last = now
    if (running && raw > 0 && raw < 400) {
      const budget = quality.half || W < 520 ? 50 : 26
      quality.slow = raw > budget ? quality.slow + 1 : Math.max(0, quality.slow - 0.25)
      if (quality.slow > 24) {
        quality.slow = 0
        if (quality.maxDpr > 1) {
          quality.maxDpr = 1
          resize()
        } else quality.half = true
      }
    }
    if (!opt.reduced) t += dt
    rings = rings.filter((r) => t - r.t0 < RING_LIFE)
    if (rows.length) {
      // sub-passos: a mola do pato fica estável mesmo com quadros longos
      for (let i = 0; i < 2; i++) stepDuck(dt / 2)
      stepDrops(dt)
      draw()
    }
    if (running) raf = requestAnimationFrame(frame)
  }

  function resize() {
    const r = canvas.getBoundingClientRect()
    if (!r.width || !r.height) return
    // tela pequena: 1,5x já fica nítido e custa metade dos pixels de 2x/3x
    dpr = Math.min(r.width < 520 ? Math.min(quality.maxDpr, 1.5) : quality.maxDpr, window.devicePixelRatio || 1)
    W = r.width
    H = r.height
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    stamps = new Map()
    buildRows()
    layoutDuck()
    if (!running) frame(performance.now())
  }
  function splash(power = 1) {
    const row = rows[DUCK_ROW]
    if (!row) return
    ring(duck.x, row.d, 11 * power)
    ring(duck.x, row.d + 0.08, 6 * power)
    if (opt.reduced) return
    duck.vy += 330 * power
    duck.va += (Math.random() - 0.5) * 1.6 * power
    const n = Math.round(16 * power)
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1
      const sp = 150 + Math.random() * 260
      const ang = (-Math.PI / 2) + side * (0.25 + Math.random() * 0.75)
      drops.push({
        ch: SPLASH[(Math.random() * SPLASH.length) | 0],
        x: duck.x + side * duck.size * (0.2 + Math.random() * 0.22),
        y: duck.y + 4,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp * 1.25,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 9,
        life: 0.9 + Math.random() * 0.5,
        color: Math.random() < 0.3 ? pal.yellow : Math.random() < 0.5 ? pal.foam : pal.kinds.base,
        size: 11 + Math.random() * 9,
      })
    }
  }

  function overDuck(x: number, y: number) {
    const s = duck.size
    return Math.abs(x - duck.x) < s * 0.42 && y > duck.y - s * 0.8 && y < duck.y + s * 0.12
  }
  const local = (e: PointerEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  /** profundidade (0…1) da fileira mais próxima de um y de tela; -1 se for acima da água */
  function depthAt(y: number) {
    if (!rows.length || y < rows[0].y - 14) return -1
    let best = rows[0]
    for (const r of rows) if (Math.abs(r.y - y) < Math.abs(best.y - y)) best = r
    return best.d
  }
  function onMove(e: PointerEvent) {
    const p = local(e)
    canvas.style.cursor = overDuck(p.x, p.y) ? 'pointer' : ''
    if (opt.reduced) return
    const d = depthAt(p.y)
    const moved = Math.hypot(p.x - lastPointer.x, p.y - lastPointer.y)
    if (d < 0 || moved < 26) return
    ring(p.x, d, clamp(moved * 0.07, 1.6, 4.5))
    lastPointer = p
  }
  function onClick(e: MouseEvent) {
    const p = local(e)
    if (overDuck(p.x, p.y)) {
      poke()
      return
    }
    const d = depthAt(p.y)
    if (d >= 0) ring(p.x, d, 8)
  }
  function poke() {
    splash(1)
    opt.onPoke?.()
    if (!running) frame(performance.now())
  }

  canvas.addEventListener('pointermove', onMove, { passive: true })
  canvas.addEventListener('click', onClick)
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  document.fonts?.ready.then(() => !running && rows.length && frame(performance.now()))

  return {
    start() {
      if (running || opt.reduced) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    },
    stop() {
      running = false
      cancelAnimationFrame(raf)
    },
    poke,
    splash,
    /** posição do pato em px do canvas (para balões por cima) */
    duck: () => ({ x: duck.x, y: duck.y, size: duck.size }),
    repaint() {
      pal = readPalette()
      stamps = new Map()
      if (!running) frame(performance.now())
    },
    destroy() {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('click', onClick)
    },
  }
}
