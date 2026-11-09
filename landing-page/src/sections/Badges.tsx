import { useState } from 'react'
import { Commit } from '../components/Commit'
import { Badge, TIER_LABEL, type Glyph, type Tier } from '../components/Badge'

type B = { name: string; glyph: Glyph; tier: Tier; rule: string; rarity: string; secret?: boolean }

const BADGES: B[] = [
  { name: 'Eagle Eye', glyph: 'eye', tier: 'diamond', rule: 'Reviews que geraram mudança no código.', rarity: '2% dos devs' },
  { name: 'Merge Machine', glyph: 'merge', tier: 'gold', rule: 'PRs mergeados sem revert em 30 dias.', rarity: '9% dos devs' },
  { name: 'Firefighter', glyph: 'flame', tier: 'silver', rule: 'Resolveu incidentes marcados como críticos.', rarity: '14% dos devs' },
  { name: 'Pair Programmer', glyph: 'pair', tier: 'bronze', rule: 'Sessões de pair com commits dos dois lados.', rarity: '31% dos devs' },
  { name: 'Mentor', glyph: 'mentor', tier: 'gold', rule: 'Ajudou devs a fecharem a primeira issue.', rarity: '6% dos devs' },
  { name: 'Necromancer', glyph: 'ghost', tier: 'silver', rule: 'Ressuscitou e fechou issue parada há mais de 6 meses.', rarity: '4% dos devs' },
  { name: 'Early Adopter', glyph: 'egg', tier: 'bronze', rule: 'Chegou antes da v1.0.', rarity: 'você, se entrar agora' },
  { name: '???', glyph: 'moon', tier: 'diamond', rule: 'Insígnia secreta. Dica: o turno da noite sabe.', rarity: '0,3% dos devs', secret: true },
]

const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'diamond']

export function Badges() {
  const [sel, setSel] = useState(0)
  const b = BADGES[sel]

  return (
    <section className="sec badges" aria-labelledby="badges-title">
      <div className="wrap">
        <Commit hash="f18e4a0" msg="feat: insígnias com tiers" />
        <div className="badges-head">
          <h2 id="badges-title" className="h2">
            A vitrine.
          </h2>
          <p className="lead">Insígnias que dizem o que você faz bem, com a raridade à mostra.</p>
          <ol className="tiers" aria-label="Tiers">
            {TIERS.map((t) => (
              <li key={t} className={`tier tier--${t}`}>
                <span className="tier-dot" aria-hidden="true" />
                {TIER_LABEL[t]}
              </li>
            ))}
          </ol>
        </div>

        <div className="vitrine">
          <div className={`vitrine-feature tier--${b.tier} ${b.secret ? 'is-secret' : ''}`} aria-live="polite">
            <div className="vitrine-pedestal" key={b.name}>
              <Badge tier={b.tier} glyph={b.glyph} size={220} secret={b.secret} title={`${b.name}, tier ${TIER_LABEL[b.tier]}`} />
            </div>
            <div className="vitrine-info">
              <span className={`vitrine-tier tier--${b.tier}`}>{TIER_LABEL[b.tier]}</span>
              <h3 className="vitrine-name">{b.name}</h3>
              <p className="vitrine-rule">{b.rule}</p>
              <p className="vitrine-rarity">
                <span className="vitrine-rarity-bar" aria-hidden="true">
                  <i style={{ width: b.secret ? '1%' : `${Math.max(3, parseFloat(b.rarity) || 40)}%` }} />
                </span>
                {b.rarity}
              </p>
            </div>
          </div>

          <ul className="shelf" aria-label="Insígnias">
            {BADGES.map((x, i) => (
              <li key={x.name}>
                <button
                  type="button"
                  className={`shelf-item ${i === sel ? 'is-on' : ''}`}
                  aria-pressed={i === sel}
                  onClick={() => setSel(i)}
                  onMouseEnter={() => setSel(i)}
                  onFocus={() => setSel(i)}
                >
                  <Badge tier={x.tier} glyph={x.glyph} size={64} secret={x.secret} />
                  <span className="shelf-name">{x.name}</span>
                  <span className="shelf-meta">{x.secret ? 'secreta' : `${TIER_LABEL[x.tier]} · ${x.rarity}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="company">
          <div className="company-pack">
            <span className="company-k">pacote de empresa</span>
            <h3 className="h3">Sua empresa cria as próprias insígnias.</h3>
            <p className="body muted">
              Cada time define o que vale celebrar. O pacote aparece no card de quem conquistou, com a marca de quem
              concedeu.
            </p>
            <div className="company-row">
              {(
                [
                  ['Deploy de sexta', 'friday', 'gold'],
                  ['Guardião do legado', 'shield', 'silver'],
                  ['Onboarding hero', 'rocket', 'bronze'],
                ] as [string, Glyph, Tier][]
              ).map(([n, g, t]) => (
                <span key={n} className="company-badge">
                  <Badge tier={t} glyph={g} size={58} />
                  <span>{n}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="alumni">
            <span className="alumni-ribbon">alumni</span>
            <span className="company-k">lagoa tech · 2023 → 2025</span>
            <p className="alumni-text">
              Saiu da empresa? <b>As insígnias ficam com você</b>, marcadas como ex-membro. O que você entregou não
              some com o crachá.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
