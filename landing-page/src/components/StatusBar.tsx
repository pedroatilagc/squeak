import { useEffect, useRef, useState } from 'react'
import { app, pushToast, toggleSound, toggleTheme } from '../lib/app'
import { useStore } from '../lib/store'

const LINE_PX = 24

/**
 * Status bar estilo IDE, sempre presente. Ln = linha de leitura (scroll / 24px),
 * Col = coluna do cursor, XP de leitura nunca diminui.
 */
export function StatusBar() {
  const theme = useStore(app, (s) => s.theme)
  const sound = useStore(app, (s) => s.sound)
  const xp = useStore(app, (s) => s.readXp)
  const [ln, setLn] = useState(1)
  const [col, setCol] = useState(1)
  const finished = useRef(false)

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        const p = max > 0 ? Math.min(1, window.scrollY / max) : 0
        setLn(Math.floor(window.scrollY / LINE_PX) + 1)
        const next = Math.round((p * 1000) / 5) * 5
        if (next > app.get().readXp) app.set({ readXp: next })
        if (p > 0.985 && !finished.current) {
          finished.current = true
          pushToast({ kind: 'badge', title: 'Insígnia desbloqueada: Leu até o fim', detail: 'Bronze · 1.000 XP de leitura' })
        }
      })
    }
    const onMove = (e: PointerEvent) => setCol(Math.floor(e.clientX / 8.4) + 1)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="statusbar" role="region" aria-label="Barra de status">
      <span className="sb-item sb-branch">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M5 3.5a1.5 1.5 0 1 0 0 .01M5 12.5a1.5 1.5 0 1 0 0 .01M11 5.5a1.5 1.5 0 1 0 0 .01M5 5v6M11 7c0 2.5-3 2.5-6 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        main
      </span>
      <span className="sb-item sb-hide-sm">
        <span className="sb-ok" aria-hidden="true">✓</span> 0 conflitos
      </span>
      <span className="sb-item sb-xp" aria-label={`${xp} XP de leitura`}>
        <span className="sb-xp-mark" aria-hidden="true">▲</span>
        {xp.toLocaleString('pt-BR')} XP de leitura
      </span>
      <span className="sb-spacer" />
      <span className="sb-item sb-hide-sm" aria-hidden="true">
        Ln {ln}, Col {col}
      </span>
      <span className="sb-item sb-hide-sm">UTF-8</span>
      <button type="button" className="sb-item sb-btn" onClick={toggleSound} aria-pressed={sound}>
        som: {sound ? 'on' : 'off'}
      </button>
      <button
        type="button"
        className="sb-item sb-btn"
        onClick={toggleTheme}
        aria-label={`tema: ${theme === 'dark' ? 'escuro' : 'claro'} (trocar para ${theme === 'dark' ? 'claro' : 'escuro'})`}
      >
        tema: {theme === 'dark' ? 'escuro' : 'claro'}
      </button>
    </div>
  )
}

/** CTA visual: sem função real, mas responde. */
export function waitlistToast() {
  pushToast({ kind: 'info', title: 'A lista ainda não abriu.', detail: 'Mas o Squeak anotou seu interesse. (Mentira, é só um protótipo.)' })
}
