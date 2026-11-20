import { toasts } from '../lib/app'
import { useStore } from '../lib/store'

export function Toaster() {
  const list = useStore(toasts, (s) => s.list)
  return (
    <div className="toaster" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span className="toast-mark" aria-hidden="true">
            {t.kind === 'xp' ? '▲' : t.kind === 'badge' ? '◆' : '›'}
          </span>
          <span>
            <strong>{t.title}</strong>
            {t.detail && <span className="toast-detail">{t.detail}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}
