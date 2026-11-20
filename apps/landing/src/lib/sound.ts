import { app } from './app'

let ctx: AudioContext | null = null

/** "Squeak" sintetizado: varredura de altura curta com ressonância de borracha. */
export function squeak(intensity = 1) {
  if (!app.get().sound) return
  try {
    ctx ??= new AudioContext()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(780, t)
    osc.frequency.exponentialRampToValueAtTime(1500 + 300 * intensity, t + 0.07)
    osc.frequency.exponentialRampToValueAtTime(950, t + 0.2)
    filter.type = 'bandpass'
    filter.frequency.value = 1700
    filter.Q.value = 3.5
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
    osc.connect(filter).connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.26)
  } catch {
    /* sem áudio: segue em silêncio */
  }
}
