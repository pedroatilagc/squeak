import { useEffect, useState } from 'react'

const CMD = '$ squeak init'

function shouldBoot() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try {
    if (sessionStorage.getItem('squeak-booted')) return false
    sessionStorage.setItem('squeak-booted', '1')
  } catch {
    /* sem storage: roda o boot mesmo assim */
  }
  return true
}

/** Pré-carregamento: digita o comando, responde e revela o hero em < 1,5s. Clique pula. */
export function Boot() {
  const [on] = useState(shouldBoot)
  const [typed, setTyped] = useState(0)
  const [done, setDone] = useState(false)
  const [gone, setGone] = useState(!on)

  useEffect(() => {
    if (!on) return
    const timers: number[] = []
    for (let i = 1; i <= CMD.length; i++) timers.push(window.setTimeout(() => setTyped(i), 120 + i * 45))
    timers.push(window.setTimeout(() => setDone(true), 120 + CMD.length * 45 + 160))
    timers.push(window.setTimeout(() => setGone(true), 1400))
    return () => timers.forEach(clearTimeout)
  }, [on])

  if (gone) return null
  return (
    <div className={`boot ${done ? 'boot--done' : ''}`} onClick={() => setGone(true)} role="presentation">
      <div className="boot-term" aria-hidden="true">
        <p>
          {CMD.slice(0, typed)}
          {!done && <span className="caret" />}
        </p>
        <p className={`boot-ok ${done ? 'is-on' : ''}`}>✓ time conectado</p>
      </div>
      <span className="boot-skip">clique para pular</span>
    </div>
  )
}
