import { useEffect, useState } from 'react'

const CMD = '$ squeak init'

/** Evento disparado quando o boot sai da tela. */
export const BOOT_DONE = 'squeak:booted'

/** Chama fn quando o boot não está (mais) na tela. Devolve o cancelamento. */
export function afterBoot(fn: () => void) {
  if (!document.querySelector('.boot')) {
    fn()
    return () => {}
  }
  const fallback = window.setTimeout(run, 2200)
  function run() {
    clearTimeout(fallback)
    window.removeEventListener(BOOT_DONE, run)
    fn()
  }
  window.addEventListener(BOOT_DONE, run)
  return () => {
    clearTimeout(fallback)
    window.removeEventListener(BOOT_DONE, run)
  }
}

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

  // avisa o hero que a tela saiu (o <squeak/> só começa a ser digitado depois)
  useEffect(() => {
    if (on && gone) window.dispatchEvent(new Event(BOOT_DONE))
  }, [on, gone])

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
