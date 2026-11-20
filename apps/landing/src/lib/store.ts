import { useSyncExternalStore } from 'react'

/** Store mínima com assinatura, para estado global sem dependência extra. */
export function createStore<T extends object>(initial: T) {
  let state = initial
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      subs.forEach((f) => f())
    },
    subscribe(f: () => void) {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
  }
}

type Store<T> = ReturnType<typeof createStore<T & object>>

export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()))
}
