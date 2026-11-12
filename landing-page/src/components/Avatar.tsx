/** Pessoas das demos. Cada uma tem a sua foto de perfil de pato (public/avatars, gerado por tools/avatars.py). */
export type Person = 'pedro' | 'ana' | 'caio' | 'lu' | 'bia' | 'leo' | 'mari' | 'ze'

// 7 artes para 8 pessoas: o zé (sala de aula) usa a do caio (time); nunca aparecem na mesma demo
const ART: Record<Person, string> = {
  pedro: 'pedro', // headset amarelo
  ana: 'ana', // fones rosa
  caio: 'caio', // gorro de crochê
  lu: 'lu', // óculos pixelados roxos
  bia: 'bia', // laço rosa
  leo: 'leo', // óculos pixelados na testa
  mari: 'mari', // óculos pixelados
  ze: 'caio',
}

type Props = { who: Person; size?: number; className?: string }

/** Foto de perfil circular de um usuário das demos. Decorativa: o nome sempre aparece ao lado. */
export function Avatar({ who, size = 32, className = '' }: Props) {
  return (
    <span className={`ava ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <img src={`/avatars/${ART[who]}.webp`} alt="" width={size} height={size} loading="lazy" decoding="async" draggable={false} />
    </span>
  )
}
