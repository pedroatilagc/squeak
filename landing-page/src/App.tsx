import { useEffect } from 'react'
import Lenis from 'lenis'
import { gsap, ScrollTrigger } from './lib/motion'
import { GitSpine } from './components/GitSpine'
import { StatusBar } from './components/StatusBar'
import { Toaster } from './components/Toaster'
import { Boot } from './sections/Boot'
import { Hero } from './sections/Hero'
import { Problem } from './sections/Problem'
import { Pillars } from './sections/Pillars'
import { EventFlow } from './sections/EventFlow'
import { ContextCall } from './sections/ContextCall'
import { Reputation } from './sections/Reputation'
import { Badges } from './sections/Badges'
import { Office } from './sections/Office'
import { NoSurveillance } from './sections/NoSurveillance'
import { Audience } from './sections/Audience'
import { Closing } from './sections/Closing'
import { Footer } from './sections/Footer'

export default function App() {
  // Scroll suave (Lenis) sincronizado com o ScrollTrigger; desligado com reduced motion.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (t: number) => lenis.raf(t * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    const onFonts = () => ScrollTrigger.refresh()
    document.fonts?.ready.then(onFonts)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [])

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Boot />
      <div className="page">
        <GitSpine />
        <main id="conteudo">
          <Hero />
          <Problem />
          <Pillars />
          <EventFlow />
          <ContextCall />
          <Reputation />
          <Badges />
          <Office />
          <NoSurveillance />
          <Audience />
          <Closing />
        </main>
        <Footer />
      </div>
      <Toaster />
      <StatusBar />
    </>
  )
}
