type Props = {
  /** 'full' = arte de 1024px · 'small' = 256px (cabeçalho e lugares pequenos) */
  res?: 'full' | 'small'
  className?: string
}

/**
 * A logo em camadas: pato sem óculos, olhos (SVG) e os óculos por cima.
 * Dentro de um elemento com a classe `dl-host`, o hover/foco faz os óculos subirem
 * para a cabeça, o pato pisca um olho e os óculos descem de volta (uma vez por hover). Camadas geradas por tools/brand-assets.py.
 */
export function DuckLogo({ res = 'full', className = '' }: Props) {
  const sfx = res === 'small' ? '-256' : ''
  return (
    <span className={`dl ${className}`}>
      <img className="dl-duck" src={`/brand/squeak-duck${sfx}.webp`} alt="" draggable={false} />
      <svg className="dl-eyes" viewBox="0 0 1024 951" aria-hidden="true">
        {/* olho da frente: pisca (o círculo fecha e vira um arco por um instante) */}
        <circle className="dl-eye dl-wink" cx="402" cy="462" r="41.5" fill="#0b0b0d" />
        <path className="dl-lid" d="M362 468 Q402 440 442 468" fill="none" stroke="#0b0b0d" strokeWidth="14" strokeLinecap="round" />
        <circle className="dl-eye" cx="742" cy="418" r="35" fill="#0b0b0d" />
      </svg>
      <span className="dl-glasses">
        <img src={`/brand/squeak-glasses${sfx}.webp`} alt="" draggable={false} />
      </span>
    </span>
  )
}
