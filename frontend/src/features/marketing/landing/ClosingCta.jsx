import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Logo } from '../../../shared/ui/Logo'
import { gsap, MOTION, useGSAP } from './gsap'
import { HeroLattice } from './HeroScene'

/** The dark bookend: the scattered pieces from the hero, now one structure. */
export function ClosingCta({ cta }) {
  const root = useRef(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.motion, () => {
        gsap.from('[data-closing-lattice]', {
          scale: 0.7,
          rotate: -20,
          opacity: 0,
          ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top 85%', end: 'top 25%', scrub: 0.8 },
        })
        gsap.to('[data-closing-float]', {
          y: -10,
          duration: 3.2,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
      })
    },
    { scope: root },
  )

  return (
    <div ref={root} data-nav-theme="dark" className="dark relative isolate overflow-hidden bg-neutral-950 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-neutral-50 to-transparent"
      />
      <div aria-hidden="true" className="lp-dot-grid absolute inset-0 -z-10" />
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -z-10 size-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/20 blur-3xl"
      />

      <section id="get-started" className="relative mx-auto max-w-6xl px-6 pb-24 pt-40 text-center sm:pt-48">
        <div className="mx-auto w-full max-w-[320px] opacity-90">
          <div data-closing-lattice>
            <div data-closing-float>
              <HeroLattice />
            </div>
          </div>
        </div>
        <h2 className="mx-auto mt-10 max-w-2xl font-display text-h1 font-semibold tracking-tight sm:text-display-lg">
          Build with shared understanding.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-body-lg text-white/70">
          Create a workspace, invite your team, and keep every decision next to
          the work it came from.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            to={cta.primary.to}
            viewTransition
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-body font-medium text-neutral-950 transition duration-200 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {cta.primary.label}
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
          {cta.secondary ? (
            <Link
              to={cta.secondary.to}
              viewTransition
              className="inline-flex h-12 items-center rounded-full border border-white/20 px-7 text-body font-medium text-white/85 transition duration-200 hover:border-white/40 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {cta.secondary.label}
            </Link>
          ) : null}
        </div>
      </section>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo on="dark" size="sm" className="brightness-150" />
            <p className="text-body-sm text-white/60">Connected work for software teams.</p>
          </div>
          <p className="text-caption text-white/50">© {new Date().getFullYear()} GraSyn</p>
        </div>
      </footer>
    </div>
  )
}
