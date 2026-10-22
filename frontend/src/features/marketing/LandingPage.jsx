import { useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ChapterCost } from './landing/ChapterCost'
import { ChapterFeatures } from './landing/ChapterFeatures'
import { ChapterFlow } from './landing/ChapterFlow'
import { ChapterIdea } from './landing/ChapterIdea'
import { ChapterPricing } from './landing/ChapterPricing'
import { ChapterProblem } from './landing/ChapterProblem'
import { ClosingCta } from './landing/ClosingCta'
import { gsap, MOTION, ScrollTrigger, useGSAP } from './landing/gsap'
import { HeroScene } from './landing/HeroScene'
import { LandingNav } from './landing/LandingNav'
import { LightsOnTransition } from './landing/LightsOnTransition'
import { useSmoothScroll } from './landing/useSmoothScroll'
import './landing/landing.css'

const NAV_PROBE_Y = 32

export function LandingPage() {
  const { isAuthenticated } = useAuth()
  const root = useRef(null)
  const nav = useRef(null)

  const cta = isAuthenticated
    ? { primary: { to: '/app', label: 'Open GraSyn' }, secondary: null }
    : {
        primary: { to: '/register', label: 'Get started free' },
        secondary: { to: '/login', label: 'Sign in' },
      }

  useSmoothScroll()

  // Runs after every chapter has created its pins (child effects run first),
  // so these triggers are measured with the pin spacing in place.
  useGSAP(
    () => {
      // Theme the nav from whatever chapter is actually under it. Hit-testing
      // respects clip-path, so the "lights on" circle switches it naturally.
      let frame = 0
      const syncNav = () => {
        frame = 0
        const header = nav.current
        if (!header) return
        const hits = document.elementsFromPoint(window.innerWidth / 2, NAV_PROBE_Y)
        const zone = hits
          .find((el) => !header.contains(el) && el.closest('[data-nav-theme]'))
          ?.closest('[data-nav-theme]')
        const theme = zone?.dataset.navTheme ?? 'dark'
        if (header.dataset.theme !== theme) header.dataset.theme = theme
      }
      const onScroll = () => {
        if (!frame) frame = requestAnimationFrame(syncNav)
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onScroll)
      syncNav()

      const mm = gsap.matchMedia()
      mm.add(MOTION.motion, () => {
        gsap.set('[data-reveal]', { opacity: 0, y: 36 })
        ScrollTrigger.batch('[data-reveal]', {
          start: 'top 88%',
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              opacity: 1,
              y: 0,
              duration: 0.9,
              stagger: 0.1,
              ease: 'expo.out',
              overwrite: true,
            }),
        })
      })

      // Late-loading images and fonts change section heights below the pins.
      let refreshTimer = 0
      const refresh = () => {
        clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 150)
      }
      const images = Array.from(root.current.querySelectorAll('img'))
      images.forEach((img) => {
        if (!img.complete) img.addEventListener('load', refresh, { once: true })
      })
      document.fonts?.ready.then(refresh)

      return () => {
        cancelAnimationFrame(frame)
        clearTimeout(refreshTimer)
        window.removeEventListener('scroll', onScroll)
        window.removeEventListener('resize', onScroll)
        images.forEach((img) => img.removeEventListener('load', refresh))
      }
    },
    { scope: root },
  )

  return (
    <div ref={root} className="min-h-svh bg-background font-sans text-foreground">
      <a
        href="#problem"
        className="sr-only z-[60] rounded-full bg-white px-4 py-2 text-body-sm font-medium text-neutral-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to the story
      </a>
      <LandingNav ref={nav} cta={cta} />
      <main>
        <HeroScene cta={cta} />
        <LightsOnTransition />
        <ChapterProblem />
        <ChapterCost />
        <ChapterIdea />
        <ChapterFlow />
        <ChapterFeatures />
        <ChapterPricing cta={cta} />
      </main>
      <ClosingCta cta={cta} />
    </div>
  )
}
