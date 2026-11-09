import { createStore } from './store'

export type Theme = 'dark' | 'light'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* armazenamento indisponível: segue só na memória */
  }
}

export const app = createStore({
  theme: (document.documentElement.getAttribute('data-theme') as Theme) || 'dark',
  sound: safeGet('squeak-sound') === 'on',
  readXp: 0,
})

export function toggleTheme() {
  const theme: Theme = app.get().theme === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme)
  safeSet('squeak-theme', theme)
  app.set({ theme })
}

export function toggleSound() {
  const sound = !app.get().sound
  safeSet('squeak-sound', sound ? 'on' : 'off')
  app.set({ sound })
}

/* ── Toasts ─────────────────────────────────────────────────────── */
export type Toast = { id: number; kind: 'xp' | 'badge' | 'info'; title: string; detail?: string }
export const toasts = createStore({ list: [] as Toast[] })
let toastId = 0
export function pushToast(t: Omit<Toast, 'id'>) {
  const id = ++toastId
  toasts.set((s) => ({ list: [...s.list.slice(-2), { ...t, id }] }))
  window.setTimeout(() => toasts.set((s) => ({ list: s.list.filter((x) => x.id !== id) })), 4200)
}

/** Lê um token CSS em tempo de execução (para Three.js, que não entende var()). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
