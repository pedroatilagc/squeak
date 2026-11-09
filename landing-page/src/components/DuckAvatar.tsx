import { useId } from 'react'

export type Accessory = 'shades' | 'headset' | 'beanie' | 'none' | 'cap'

type Props = { accessory?: Accessory; size?: number; className?: string; mood?: 'happy' | 'focus' | 'calm' }

/**
 * Avatar de pato em SVG (para mockups de UI). Cores 100% via tokens:
 * no tema claro ganha contorno marrom, no escuro um brilho quente.
 */
export function DuckAvatar({ accessory = 'none', size = 64, className = '', mood = 'calm' }: Props) {
  const id = useId().replace(/:/g, '')
  const ol = { stroke: 'var(--duck-outline)', strokeWidth: 2.4, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`dh-${id}`} cx=".36" cy=".3" r=".78">
          <stop offset="0" stopColor="var(--duck-highlight)" />
          <stop offset=".42" stopColor="var(--duck-body)" />
          <stop offset="1" stopColor="var(--duck-shadow)" />
        </radialGradient>
        <linearGradient id={`db-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--duck-beak)" />
          <stop offset="1" stopColor="var(--beak-orange)" stopOpacity=".8" />
        </linearGradient>
      </defs>
      {/* cabeça com volume de borracha */}
      <circle cx="30" cy="35" r="21" fill={`url(#dh-${id})`} {...ol} />
      {/* brilho especular */}
      <ellipse cx="21" cy="22" rx="6.5" ry="3.6" fill="var(--catchlight)" opacity=".55" transform="rotate(-28 21 22)" />
      <circle cx="16.5" cy="27.5" r="1.4" fill="var(--catchlight)" opacity=".5" />
      {/* bochechas */}
      <ellipse cx="20" cy="42" rx="4.5" ry="2.6" fill="var(--duck-beak)" opacity=".28" />
      <ellipse cx="41" cy="41" rx="3.5" ry="2.2" fill="var(--duck-beak)" opacity=".24" />
      {/* bico: superior + inferior em sorriso */}
      <path d="M35 40.5c4-3.6 13-4.4 18.5-1.4 2.6 1.4 2 4-1.4 5.2-5 1.8-12.6 1.7-16.4-.2-2-1-2.3-2.4-.7-3.6z" fill={`url(#db-${id})`} {...ol} />
      <path d="M37.5 44.6c3.6 2.6 9.6 2.9 13.4.6" fill="none" stroke="var(--duck-eye)" strokeOpacity=".28" strokeWidth="1.5" strokeLinecap="round" />
      {mood === 'happy' && <path d="M38.5 46.2c3 2.4 8.2 2.6 11.2.4" fill="none" stroke="var(--duck-beak)" strokeWidth="2.6" strokeLinecap="round" />}
      {/* olhos */}
      {mood === 'happy' ? (
        <path d="M22 31.5q3-4 6 0M36.5 30.5q3-4 6 0" fill="none" stroke="var(--duck-eye)" strokeWidth="2.7" strokeLinecap="round" />
      ) : (
        <>
          <ellipse cx="25" cy="31" rx="2.9" ry={mood === 'focus' ? 2.2 : 3.6} fill="var(--duck-eye)" />
          <ellipse cx="39.5" cy="30" rx="2.9" ry={mood === 'focus' ? 2.2 : 3.6} fill="var(--duck-eye)" />
          <circle cx="26" cy="29.4" r="1.1" fill="var(--catchlight)" />
          <circle cx="40.5" cy="28.4" r="1.1" fill="var(--catchlight)" />
        </>
      )}
      {/* acessórios */}
      {accessory === 'shades' && (
        <g shapeRendering="crispEdges">
          {/* óculos thug life: pixels de 2.2 unidades */}
          <path
            fill="var(--duck-eye)"
            d="M15.6 25.6h33v2.2h-33zM15.6 27.8h13.2v2.2h-13.2zM35.4 27.8h13.2v2.2h-13.2zM17.8 30h11v2.2h-11zM35.4 30h11v2.2h-11zM20 32.2h8.8v2.2h-8.8zM35.4 32.2h8.8v2.2h-8.8z"
          />
          <path fill="var(--catchlight)" d="M20 27.8h2.2v2.2h-2.2zM22.2 30h2.2v2.2h-2.2zM37.6 27.8h2.2v2.2h-2.2zM39.8 30h2.2v2.2h-2.2z" />
        </g>
      )}
      {accessory === 'headset' && (
        <g fill="none" strokeLinecap="round">
          <path d="M10 33c0-14 9-22 20-22s20 8 20 22" stroke="var(--duck-eye)" strokeWidth="5" />
          <path d="M10 33c0-14 9-22 20-22s20 8 20 22" stroke="var(--pond-blue)" strokeWidth="2.4" />
          <rect x="5" y="29" width="9" height="13" rx="4" fill="var(--duck-eye)" stroke="var(--pond-blue)" strokeWidth="1.6" />
          <rect x="46" y="29" width="7" height="12" rx="3.5" fill="var(--duck-eye)" stroke="var(--pond-blue)" strokeWidth="1.6" />
          <path d="M9.5 42c0 5 4 8.5 10.5 8.5" stroke="var(--duck-eye)" strokeWidth="2.4" />
          <circle cx="21" cy="50.5" r="2.4" fill="var(--pond-blue)" />
        </g>
      )}
      {accessory === 'beanie' && (
        <g>
          <path d="M11 26c0-12 9-18 20-18s20 6 20 18z" fill="var(--beak-orange)" {...ol} />
          <rect x="9" y="23" width="44" height="6" rx="3" fill="var(--duck-shadow)" {...ol} />
          <circle cx="31" cy="7" r="4" fill="var(--duck-highlight)" {...ol} />
        </g>
      )}
      {accessory === 'cap' && (
        <g>
          <path d="M12 24c0-10 8-15 19-15s19 5 19 15z" fill="var(--pond-blue)" {...ol} />
          <path d="M44 22c6 0 11 1 14 3-3 2-8 2-14 1z" fill="var(--pond-blue)" {...ol} />
        </g>
      )}
    </svg>
  )
}
