import type { ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  className?: string
  accent?: boolean
  bar?: ReactNode
  label?: string
}

/** Moldura de janela própria do Squeak (sem imitar sistemas operacionais). */
export function Window({ title, children, className = '', accent, bar, label }: Props) {
  return (
    <div className={`win ${accent ? 'win--accent' : ''} ${className}`} role={label ? 'img' : undefined} aria-label={label}>
      <div className="win-bar">
        <span className="win-glyph" aria-hidden="true" />
        <span className="win-title">{title}</span>
        {bar}
        <span className="win-ctrl" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="win-body">{children}</div>
    </div>
  )
}
