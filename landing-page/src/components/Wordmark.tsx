import { DuckLogo } from './DuckLogo'

type Props = { size?: number; className?: string; href?: string }

/** Assinatura da marca: o pato de óculos + o nome como componente, <squeak/>. */
export function Wordmark({ size = 34, className = '', href = '#' }: Props) {
  return (
    <a className={`wordmark dl-host ${className}`} href={href} aria-label="Squeak, início">
      <span className="wordmark-logo" style={{ width: size }}>
        <DuckLogo res="small" />
      </span>
      <span className="wordmark-name" aria-hidden="true">
        <span className="wm-br">&lt;</span>squeak<span className="wm-br">/&gt;</span>
      </span>
    </a>
  )
}
