import { useId } from 'react'

export type Tier = 'bronze' | 'silver' | 'gold' | 'diamond'
export type Glyph = 'merge' | 'eye' | 'flame' | 'pair' | 'mentor' | 'ghost' | 'moon' | 'egg' | 'friday' | 'shield' | 'rocket' | 'book'

export const TIER_LABEL: Record<Tier, string> = { bronze: 'Bronze', silver: 'Prata', gold: 'Ouro', diamond: 'Diamante' }
const TIER_RANK: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3, diamond: 4 }

const GLYPHS: Record<Glyph, string> = {
  merge: 'M7 4.5a2 2 0 1 0 0 .01M7 19.5a2 2 0 1 0 0 .01M17 12a2 2 0 1 0 0 .01M7 6.5v11M7 8c0 3.5 3 4 8 4',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6',
  flame: 'M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6.5.3 2 1.2 3 2.3 3.2C11 8 10.5 5.5 12 3z',
  pair: 'M9 5.5a3 3 0 1 0 0 6 3 3 0 1 0 0-6M16.5 6.5a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 1 0 0-5.2M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5M14 15c.8-.4 1.6-.6 2.5-.6 2.6 0 4.5 1.8 4.5 4.6',
  mentor: 'M9.5 18.5h5M10.5 21h3M12 3a6 6 0 0 0-3.8 10.6c.8.7 1.3 1.6 1.3 2.6V16h5v-.8c0-1 .5-1.9 1.3-2.6A6 6 0 0 0 12 3z',
  ghost: 'M6 20.5V10a6 6 0 0 1 12 0v10.5l-2-1.7-2 1.7-2-1.7-2 1.7-2-1.7zM10 10.5v.01M14 10.5v.01',
  moon: 'M19.5 14.5A8 8 0 1 1 9.5 4.5a6.2 6.2 0 0 0 10 10z',
  egg: 'M12 21c-4 0-6.5-3-6.5-7 0-5 3-11 6.5-11s6.5 6 6.5 11c0 4-2.5 7-6.5 7zM9 12l2 1.5 1.5-2 2 1.5',
  friday: 'M4 7.5h16M4 7.5v11.5h16V7.5M8 4v4M16 4v4M9.5 15l2 2 4-4.5',
  shield: 'M12 3l7.5 3v5.5c0 5-3.3 8.3-7.5 9.5-4.2-1.2-7.5-4.5-7.5-9.5V6zM9 12l2 2 4-4.5',
  rocket: 'M13.5 15.5l-5-5C10 6 14 3.5 20.5 3.5 20.5 10 18 14 13.5 15.5zM8.5 10.5L5 11l-2 3 4 .5M13.5 15.5L13 19l-3 2-.5-4M7 17l-2.5 2.5',
  book: 'M4.5 5.5c2.5-1 5-1 7.5.5 2.5-1.5 5-1.5 7.5-.5v13c-2.5-1-5-1-7.5.5-2.5-1.5-5-1.5-7.5-.5zM12 6v13',
}

type Props = {
  tier: Tier
  glyph: Glyph
  size?: number
  secret?: boolean
  className?: string
  title?: string
}

/**
 * Medalhão de insígnia: anel no tom do tier, face esmaltada escura, glifo em traço
 * e "pips" de tier embaixo. Linguagem única para todas as insígnias.
 */
export function Badge({ tier, glyph, size = 96, secret, className = '', title }: Props) {
  const id = useId().replace(/:/g, '')
  const color = `var(--tier-${tier})`
  const hex = (r: number, cx = 50, cy = 48) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2
      return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
    }).join(' ')

  return (
    <svg
      viewBox="0 0 100 104"
      width={size}
      height={size * 1.04}
      className={`badge ${secret ? 'badge--secret' : ''} ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset=".55" stopColor={color} stopOpacity=".72" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
        <radialGradient id={`face-${id}`} cx=".35" cy=".25" r=".9">
          <stop offset="0" stopColor="var(--badge-face-hi)" />
          <stop offset="1" stopColor="var(--badge-face)" />
        </radialGradient>
      </defs>
      <polygon points={hex(42)} fill={`url(#ring-${id})`} stroke={`url(#ring-${id})`} strokeWidth="9" strokeLinejoin="round" />
      <polygon points={hex(33)} fill={`url(#face-${id})`} stroke="var(--badge-face)" strokeWidth="5" strokeLinejoin="round" />
      <polygon points={hex(27)} fill="none" stroke={color} strokeOpacity=".28" strokeWidth="1" strokeLinejoin="round" />
      {secret ? (
        <text x="50" y="58" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="30" fill={color}>
          ?
        </text>
      ) : (
        <g transform="translate(32 30) scale(1.5)" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d={GLYPHS[glyph]} />
        </g>
      )}
      {/* brilho do anel */}
      <path d="M22 22 L40 10" stroke="var(--catchlight)" strokeOpacity=".45" strokeWidth="2.4" strokeLinecap="round" />
      {/* pips de tier */}
      <g>
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={38 + i * 8} cy="99" r="2.6" fill={i < TIER_RANK[tier] ? color : 'var(--border)'} />
        ))}
      </g>
    </svg>
  )
}
