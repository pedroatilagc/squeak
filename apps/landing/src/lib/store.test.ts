import { describe, expect, it, vi } from 'vitest'
import { createStore } from './store'

describe('createStore', () => {
  it('devolve o estado inicial', () => {
    const store = createStore({ theme: 'dark', sound: false })
    expect(store.get()).toEqual({ theme: 'dark', sound: false })
  })

  it('mescla o patch sem perder as outras chaves', () => {
    const store = createStore({ theme: 'dark', sound: false })
    store.set({ sound: true })
    expect(store.get()).toEqual({ theme: 'dark', sound: true })
  })

  it('aceita função que recebe o estado atual', () => {
    const store = createStore({ count: 1 })
    store.set((s) => ({ count: s.count + 1 }))
    expect(store.get().count).toBe(2)
  })

  it('avisa os assinantes a cada set e para depois do unsubscribe', () => {
    const store = createStore({ count: 0 })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.set({ count: 1 })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.set({ count: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
