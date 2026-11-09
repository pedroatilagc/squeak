import { useRef, useState } from 'react'
import { Commit } from '../components/Commit'
import { DuckAvatar } from '../components/DuckAvatar'
import { Badge } from '../components/Badge'
import { gsap, MQ, ScrollTrigger, useGSAP } from '../lib/motion'

type Pillar = { file: string; title: string; line: string; Preview: () => JSX.Element }

function PreviewComms() {
  return (
    <div className="pv pv-comms">
      <div className="pv-rail">
        {['lg', 'os', 'hk'].map((s, i) => (
          <span key={s} className={`pv-server ${i === 0 ? 'is-on' : ''}`}>{s}</span>
        ))}
      </div>
      <div className="pv-chans">
        <span className="pv-label">canais</span>
        {['geral', 'auth', 'deploys'].map((c, i) => (
          <span key={c} className={`pv-chan ${i === 1 ? 'is-on' : ''}`}># {c}</span>
        ))}
        <span className="pv-label">voz</span>
        <span className="pv-voice">
          <span className="pv-voice-name">daily</span>
          <span className="pv-voice-people">
            <DuckAvatar accessory="headset" size={20} />
            <DuckAvatar accessory="shades" size={20} />
            <DuckAvatar accessory="beanie" size={20} />
          </span>
        </span>
      </div>
      <div className="pv-chat">
        <div className="pv-msg">
          <DuckAvatar accessory="beanie" size={30} />
          <p>
            <b>caio</b> alguém olha o erro do upload comigo?
          </p>
        </div>
        <div className="pv-msg">
          <DuckAvatar accessory="shades" size={30} />
          <p>
            <b>ana</b> bora, compartilha a tela na <span className="pv-chip">#daily</span>
          </p>
        </div>
        <div className="pv-screen">
          <span className="pv-screen-tag">caio está compartilhando a tela</span>
          <span className="pv-screen-code">
            <i style={{ width: '62%' }} />
            <i style={{ width: '40%' }} className="is-err" />
            <i style={{ width: '74%' }} />
          </span>
        </div>
      </div>
    </div>
  )
}

function PreviewExec() {
  const cols: [string, [string, string, string?][]][] = [
    ['Backlog', [['#57', 'Exportar relatório'], ['#60', 'Dark mode no app']]],
    ['Em andamento', [['#51', 'Bug no upload de avatar', 'beanie']]],
    ['Review', [['#42', 'Login com GitHub', 'headset']]],
    ['Done', [['#38', 'Fluxo de auth', 'shades']]],
  ]
  return (
    <div className="pv pv-exec">
      <div className="pv-sprint">
        <span>Sprint 12</span>
        <span className="pv-bar">
          <i style={{ width: '68%' }} />
        </span>
        <span className="pv-muted">68% · 4 dias</span>
      </div>
      <div className="pv-cols">
        {cols.map(([name, cards]) => (
          <div key={name} className="pv-col">
            <span className="pv-col-name">
              {name} <em>{cards.length}</em>
            </span>
            {cards.map(([id, t, who]) => (
              <span key={id} className="pv-card">
                <span className="pv-card-id">{id}</span>
                <span className="pv-card-t">{t}</span>
                <span className="pv-card-meta">
                  <span className="pv-chip"># auth</span>
                  {who && <DuckAvatar accessory={who as 'beanie'} size={18} />}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviewGit() {
  const steps: [string, string, string][] = [
    ['dot--info', 'pedro abriu o PR', 'feat/login → main'],
    ['dot--ok', 'checks passaram', '14/14 · 2m 31s'],
    ['dot--warn', 'ana pediu mudanças', '2 comentários'],
    ['dot--ok', 'ana aprovou', 'depois de 3 commits'],
    ['dot--merge', 'mergeado em main', 'squash · 4f2a9c1'],
  ]
  return (
    <div className="pv pv-git">
      <div className="pv-pr-head">
        <span className="pv-pr-state">merged</span>
        <b>#42</b> feat: login com GitHub
      </div>
      <ol className="pv-timeline">
        {steps.map(([c, t, m]) => (
          <li key={t}>
            <span className={`pv-dot ${c}`} />
            <span>{t}</span>
            <span className="pv-muted">{m}</span>
          </li>
        ))}
      </ol>
      <div className="pv-auto">
        <span className="pv-auto-tag">automático</span>
        card <b>#42</b> movido de <b>Review</b> para <b>Done</b>
      </div>
    </div>
  )
}

function PreviewRep() {
  return (
    <div className="pv pv-rep">
      <div className="pv-rep-head">
        <DuckAvatar accessory="shades" size={56} mood="happy" />
        <div>
          <b className="pv-rep-name">ana.dev</b>
          <span className="pv-muted">Backend · Go · Postgres</span>
        </div>
        <span className="pv-level">
          <small>level</small>23
        </span>
      </div>
      <div className="pv-xp">
        <span className="pv-bar pv-bar--xp">
          <i style={{ width: '72%' }} />
        </span>
        <span className="pv-muted">7.240 / 10.000 XP · #4 na temporada 3</span>
      </div>
      <div className="pv-badges">
        <Badge tier="gold" glyph="eye" size={56} />
        <Badge tier="silver" glyph="merge" size={56} />
        <Badge tier="bronze" glyph="mentor" size={56} />
        <Badge tier="diamond" glyph="flame" size={56} />
      </div>
    </div>
  )
}

const PILLARS: Pillar[] = [
  { file: 'comunicacao.ts', title: 'Comunicação', line: 'Servidores, canais, calls e tela compartilhada. A conversa fica do lado do trabalho.', Preview: PreviewComms },
  { file: 'execucao.ts', title: 'Execução', line: 'Kanban, sprints e issues ligados aos canais e às calls. Todo card tem dono e conversa.', Preview: PreviewExec },
  { file: 'github.ts', title: 'GitHub integrado', line: 'PRs, reviews e commits no feed. PR mergeado? O card vai sozinho pra Done.', Preview: PreviewGit },
  { file: 'reputacao.ts', title: 'Reputação', line: 'Level, rank por temporada, insígnias e o card do dev, um currículo que se escreve sozinho.', Preview: PreviewRep },
]

export function Pillars() {
  const root = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const st = useRef<ScrollTrigger | null>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MQ.story, () => {
        st.current = ScrollTrigger.create({
          trigger: root.current,
          start: 'top top',
          end: '+=2400',
          pin: true,
          onUpdate: (self) => setActive(Math.min(3, Math.floor(self.progress * 4))),
        })
        return () => {
          st.current = null
        }
      })
    },
    { scope: root },
  )

  const open = (i: number) => {
    setActive(i)
    const t = st.current
    if (t) window.scrollTo({ top: t.start + ((i + 0.5) / 4) * (t.end - t.start), behavior: 'smooth' })
  }

  const P = PILLARS[active]
  return (
    <section ref={root} className="sec pillars" aria-labelledby="pillars-title">
      <div className="wrap">
        <Commit hash="a3f9c1e" msg="feat: comunicação, execução, github, reputação" />
        <h2 id="pillars-title" className="h2 pillars-title">
          Quatro pilares. <span className="muted">Um lugar.</span>
        </h2>

        <div className="ide">
          <div className="ide-tabs" role="tablist" aria-label="Pilares do Squeak">
            {PILLARS.map((p, i) => (
              <button
                key={p.file}
                type="button"
                role="tab"
                id={`tab-${p.file}`}
                aria-selected={i === active}
                aria-controls="ide-panel"
                tabIndex={i === active ? 0 : -1}
                className={`ide-tab ${i === active ? 'is-on' : ''}`}
                onClick={() => open(i)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    const n = (i + (e.key === 'ArrowRight' ? 1 : 3)) % 4
                    open(n)
                    document.getElementById(`tab-${PILLARS[n].file}`)?.focus()
                  }
                }}
              >
                <span className="ide-ts" aria-hidden="true">TS</span>
                {p.file}
              </button>
            ))}
          </div>
          <div className="ide-body">
            <nav className="ide-tree" aria-label="Arquivos">
              <span className="ide-folder">▾ squeak</span>
              <span className="ide-folder ide-indent">▾ src</span>
              {PILLARS.map((p, i) => (
                <button key={p.file} type="button" className={`ide-file ${i === active ? 'is-on' : ''}`} onClick={() => open(i)} tabIndex={-1}>
                  {p.file}
                </button>
              ))}
              <span className="ide-file ide-file--dim">squeak.config.ts</span>
              <span className="ide-file ide-file--dim">README.md</span>
            </nav>
            <div className="ide-editor" id="ide-panel" role="tabpanel" aria-labelledby={`tab-${P.file}`}>
              <div className="ide-code" key={P.file}>
                <span className="ide-ln" aria-hidden="true">
                  {Array.from({ length: 14 }, (_, n) => (
                    <span key={n}>{n + 1}</span>
                  ))}
                </span>
                <div className="ide-doc">
                  <span className="ide-comment" aria-hidden="true">/**</span>
                  <h3 className="ide-title">{P.title}</h3>
                  <p className="ide-line">{P.line}</p>
                  <span className="ide-comment" aria-hidden="true">
                    {' */'} <span className="ide-kw">export default</span> &lt;{P.title.replace(/\s.*/, '')} /&gt;
                  </span>
                </div>
              </div>
              <div className="ide-preview" key={`pv-${P.file}`}>
                <P.Preview />
              </div>
            </div>
          </div>
          <div className="ide-progress" aria-hidden="true">
            {PILLARS.map((p, i) => (
              <i key={p.file} className={i <= active ? 'is-on' : ''} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
