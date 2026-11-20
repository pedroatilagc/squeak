/**
 * Sprites do Squeak em pixel art, desenhados à mão (16x16, com 3px de folga em cima
 * para acessórios). Legenda:
 *   .  vazio        k  contorno     y  corpo       d  sombra do corpo   h  brilho
 *   o  bico         O  bico escuro  e  olho        w  brilho do olho
 *   a  acessório    A  acessório escuro            m  metal            s  lente
 */

export type View = 'front' | 'back' | 'side'
export type Accessory = 'headset' | 'shades' | 'beanie' | 'cap' | 'none' | 'bow'

export const SPRITE_W = 16
export const SPRITE_H = 19 // 3 linhas de folga + 16 do corpo
const HEAD_ROOM = 3

const FRONT = [
  '................',
  '.....kkkkkk.....',
  '....khhyyyyk....',
  '...khyyyyyyyk...',
  '...kyewyyewyk...',
  '...kyeeyyeeyk...',
  '...kyyooooyyk...',
  '....kyOOOOyk....',
  '..kkkyyyyyykkk..',
  '.kyyyyyyyyyyyyk.',
  'kyhyyyyyyyyyyhyk',
  'kyhyyyyyyyyyyhyk',
  'kdyyyyyyyyyyyydk',
  '.kddyyyyyyyyddk.',
  '..kkddddddddkk..',
  '....kkkkkkkk....',
]

const BACK = [
  '................',
  '.....kkkkkk.....',
  '....khhyyyyk....',
  '...khyyyyyyyk...',
  '...kyyyyyyyyk...',
  '...kyyyyyyyyk...',
  '...kdyyyyyydk...',
  '....kddyyddk....',
  '..kkkyyhhyykkk..',
  '.kyyyyhyyhyyyyk.',
  'kyyyyyyhhyyyyyyk',
  'kyhyyyyyyyyyyhyk',
  'kdyyyyyyyyyyyydk',
  '.kddyyyyyyyyddk.',
  '..kkddddddddkk..',
  '....kkkkkkkk....',
]

const SIDE = [
  '................',
  '......kkkkk.....',
  '.....khhyyyk....',
  '....khyyyyyyk...',
  '....kyyyyyewkkk.',
  '....kyyyyyeeoook',
  '....kyyyyyyyOOOk',
  '.kk..kyyyyyyk...',
  '.kyk.kyyyyyyyk..',
  '.kyykkyyyyyyyyk.',
  '.kyyyyyhhyyyyyk.',
  '.kyyyyhddhyyyyk.',
  '.kdyyyyddyyyyyk.',
  '..kddyyyyyyyydk.',
  '...kkddddddddk..',
  '.....kkkkkkk....',
]

/** Acessórios por vista, desenhados por cima (coordenadas já com a folga). */
const ACC: Record<Exclude<Accessory, 'none'>, Partial<Record<View, string[]>>> = {
  headset: {
    front: [
      '................',
      '................',
      '.....kkkkkk.....',
      '....kmmmmmmk....',
      '...km......mk...',
      '...k........k...',
      '..kAk......kAk..',
      '..kAk......kAk..',
      '..kAk......kAk..',
      '...k.........k..',
      '....km..........',
      '.....kmm........',
    ],
    side: [
      '................',
      '................',
      '......kkkkk.....',
      '.....kmmmmmk....',
      '.....km.........',
      '....kAAk........',
      '....kAAk........',
      '....kAAk........',
      '.....kk.........',
    ],
    back: [
      '................',
      '................',
      '.....kkkkkk.....',
      '....kmmmmmmk....',
      '...km......mk...',
      '...k........k...',
      '..kAk......kAk..',
      '..kAk......kAk..',
      '..kAk......kAk..',
    ],
  },
  shades: {
    front: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '..kkkkkkkkkkkk..',
      '...kwkk..kwkk...',
      '....kk....kk....',
    ],
    side: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.......kkkkkkk..',
      '........kwkk....',
    ],
    back: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '...kkkkkkkkkk...',
    ],
  },
  beanie: {
    front: [
      '.......kk.......',
      '......khhk......',
      '....kkkkkkkk....',
      '...kaaaaaaaak...',
      '..kaaaaaaaaaak..',
      '..kAAAAAAAAAAk..',
      '...kkkkkkkkkk...',
    ],
    side: [
      '........kk......',
      '.......khhk.....',
      '.....kkkkkkk....',
      '....kaaaaaaak...',
      '...kaaaaaaaaak..',
      '...kAAAAAAAAk...',
      '....kkkkkkkk....',
    ],
    back: [
      '.......kk.......',
      '......khhk......',
      '....kkkkkkkk....',
      '...kaaaaaaaak...',
      '..kaaaaaaaaaak..',
      '..kAAAAAAAAAAk..',
      '...kkkkkkkkkk...',
    ],
  },
  cap: {
    front: [
      '................',
      '................',
      '.....kkkkkk.....',
      '....kaaaaaak....',
      '...kaaaaaaaak...',
      '..kAAAAAAAAAAk..',
      '...kkkkkkkkkk...',
    ],
    side: [
      '................',
      '................',
      '......kkkkk.....',
      '.....kaaaaak....',
      '....kaaaaaaakkkk',
      '....kAAAAAAAAAAk',
      '.....kkkkkkkkkk.',
    ],
    back: [
      '................',
      '................',
      '.....kkkkkk.....',
      '....kaaaaaak....',
      '...kaaaaaaaak...',
      '...kAAAAAAAAk...',
      '....kkkkkkkk....',
    ],
  },
  bow: {
    front: [
      '................',
      '................',
      '................',
      '.........kk.kk..',
      '........kaakaak.',
      '.........kAAk...',
      '..........kk....',
    ],
    side: [
      '................',
      '................',
      '................',
      '......kk.kk.....',
      '.....kaakaak....',
      '......kAAk......',
      '.......kk.......',
    ],
    back: [
      '................',
      '................',
      '................',
      '.....kk.kk......',
      '....kaakaak.....',
      '.....kAAk.......',
      '......kk........',
    ],
  },
}

export type Palette = Record<string, string>

const BASE: Record<View, string[]> = { front: FRONT, back: BACK, side: SIDE }

function check(rows: string[], label: string) {
  rows.forEach((r, i) => {
    if (r.length !== SPRITE_W) throw new Error(`sprite ${label} linha ${i}: ${r.length} colunas`)
  })
}
Object.entries(BASE).forEach(([k, v]) => check(v, k))
Object.entries(ACC).forEach(([a, views]) => Object.entries(views).forEach(([v, rows]) => check(rows!, `${a}/${v}`)))

const ACC_COLORS: Record<Exclude<Accessory, 'none'>, [string, string]> = {
  headset: ['eye', 'eye'],
  shades: ['eye', 'eye'],
  beanie: ['beak', 'beakDk'],
  cap: ['blue', 'blueDk'],
  bow: ['pink', 'pinkDk'],
}

/** Gera um canvas por (vista, acessório). Lado gerado virado para a direita. */
export function buildSprites(pal: Palette) {
  const map = (ch: string, acc: Accessory): string | null => {
    switch (ch) {
      case 'k': return pal.ink
      case 'y': return pal.duck
      case 'd': return pal.duckDk
      case 'h': return pal.duckHi
      case 'o': return pal.beak
      case 'O': return pal.beakDk
      case 'e': return pal.eye
      case 'w': return pal.white
      case 'm': return pal.metal
      case 's': return pal.screen
      case 'a': return acc === 'none' ? null : pal[ACC_COLORS[acc][0]]
      case 'A': return acc === 'none' ? null : pal[ACC_COLORS[acc][1]]
      default: return null
    }
  }
  const cache = new Map<string, HTMLCanvasElement>()
  const views: View[] = ['front', 'back', 'side']
  const accs: Accessory[] = ['headset', 'shades', 'beanie', 'cap', 'none', 'bow']
  for (const v of views) {
    for (const a of accs) {
      const c = document.createElement('canvas')
      c.width = SPRITE_W
      c.height = SPRITE_H
      const g = c.getContext('2d')!
      const paint = (rows: string[], dy: number) =>
        rows.forEach((r, y) =>
          [...r].forEach((ch, x) => {
            const col = map(ch, a)
            if (col) {
              g.fillStyle = col
              g.fillRect(x, y + dy, 1, 1)
            }
          }),
        )
      paint(BASE[v], HEAD_ROOM)
      if (a !== 'none') {
        const rows = ACC[a][v]
        if (rows) paint(rows, 0)
      }
      cache.set(`${v}:${a}`, c)
    }
  }
  return (view: View, acc: Accessory) => cache.get(`${view}:${acc}`)!
}
