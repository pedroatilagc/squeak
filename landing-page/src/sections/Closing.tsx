import { useRef, useState } from 'react'
import { Commit } from '../components/Commit'
import { waitlistToast } from '../components/StatusBar'
import { PixelWalker, type PixelWalkerHandle } from '../mascot/pixel/PixelWalker'

const REPLIES = [
  'Já tentou desligar e ligar?',
  'Parece um problema de cache.',
  'Funciona na minha máquina.',
  'Você explicou em voz alta e já achou o bug, né? Eu sei.',
  'Off-by-one. É sempre off-by-one.',
  'Confere se a variável de ambiente tá carregada.',
  'Isso é timezone. Confia.',
  'Squeak. (tradução: dá um git blame e respira)',
]

export function Closing() {
  const duck = useRef<PixelWalkerHandle>(null)
  const [text, setText] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const last = useRef(-1)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) {
      setReply('Pode mandar. Eu escuto qualquer bug.')
      return
    }
    let i = Math.floor(Math.random() * REPLIES.length)
    if (i === last.current) i = (i + 1) % REPLIES.length
    last.current = i
    setReply(REPLIES[i])
    duck.current?.explain(text.trim())
    setText('')
  }

  return (
    <section className="sec closing" aria-labelledby="closing-title">
      <div className="wrap">
        <Commit hash="bada55e" msg="chore: rubber duck debugging" />
      </div>
      <div className="closing-stage">
        <PixelWalker ref={duck} />
        {reply && (
          <p className="closing-reply" role="status" key={reply}>
            {reply}
          </p>
        )}
      </div>
      <div className="wrap closing-copy">
        <h2 id="closing-title" className="closing-title">
          Explique seu bug pro Squeak.
        </h2>
        <form className="closing-form" onSubmit={submit}>
          <label htmlFor="bug" className="sr-only">
            Descreva seu bug
          </label>
          <span className="closing-prompt" aria-hidden="true">
            $
          </span>
          <input
            id="bug"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="o login só quebra em produção, e só às sextas…"
            autoComplete="off"
          />
          <button type="submit" className="btn btn--primary">
            Explicar
          </button>
        </form>
        <p className="closing-end">
          Você leu até aqui. <span className="hl">Entra na lista, vai.</span>
        </p>
        <button type="button" className="btn btn--primary btn--big" onClick={waitlistToast}>
          Entrar na lista de espera
        </button>
      </div>
    </section>
  )
}
