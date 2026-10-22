import { useRef } from 'react'
import { Logo } from '../../../shared/ui/Logo'
import { gsap, MOTION, useGSAP } from './gsap'

/**
 * Dark → light. A circle of light grows from the centre while you scroll,
 * revealing the light half of the story. Static fallback: the light stage.
 */
export function LightsOnTransition() {
  const root = useRef(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add({ story: MOTION.story, simple: MOTION.simple }, ({ conditions }) => {
        gsap.set('[data-bloom]', { clipPath: 'circle(0% at 50% 55%)' })
        gsap.set('[data-question]', { opacity: 0, y: 30 })
        gsap.set('[data-meet] > *', { opacity: 0, y: 24 })

        // The question arrives while the section scrolls up, so the dark
        // screen is never empty once it pins.
        gsap.to('[data-question]', {
          opacity: 1,
          y: 0,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: root.current,
            start: 'top 80%',
            end: 'top 20%',
            scrub: 0.6,
          },
        })

        gsap
          .timeline({
            scrollTrigger: {
              trigger: root.current,
              start: conditions.story ? 'top top' : 'top 40%',
              end: conditions.story ? '+=120%' : 'bottom 30%',
              pin: conditions.story,
              scrub: 0.6,
            },
          })
          .to('[data-question]', { opacity: 0, y: -30, scale: 0.96, duration: 0.25 }, 0.1)
          .to(
            '[data-bloom]',
            { clipPath: 'circle(150% at 50% 55%)', duration: 0.6, ease: 'power2.in' },
            0.12,
          )
          .to('[data-meet] > *', { opacity: 1, y: 0, duration: 0.25, stagger: 0.06 }, 0.38)
          .to({}, { duration: 0.2 })
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} aria-labelledby="lights-on-title" className="relative">
      <div className="relative h-svh min-h-[560px] overflow-hidden bg-neutral-950">
        <div data-nav-theme="dark" className="absolute inset-0">
          <div className="lp-dot-grid absolute inset-0 opacity-60" aria-hidden="true" />
          <p
            data-question
            className="absolute inset-x-6 top-1/2 mx-auto max-w-3xl -translate-y-1/2 text-center font-display text-h1 font-semibold tracking-tight text-white opacity-0 sm:text-display-lg"
          >
            What if all of it lived in{' '}
            <span className="text-brand-300">one place?</span>
          </p>
        </div>

        <div
          data-bloom
          data-nav-theme="light"
          className="absolute inset-0 grid place-items-center bg-background"
        >
          <div className="lp-dot-grid-light absolute inset-0" aria-hidden="true" />
          <div data-meet className="relative px-6 text-center">
            <p className="text-caption font-medium uppercase tracking-[0.2em] text-primary">
              All of it, in one place
            </p>
            <h2
              id="lights-on-title"
              className="mt-4 flex items-center justify-center gap-3 font-display text-h1 font-semibold tracking-tight text-foreground sm:text-display-lg"
            >
              Meet
              <Logo on="light" size="lg" className="h-10 sm:h-14" />
            </h2>
            <p className="mx-auto mt-4 max-w-md text-body-lg text-muted-foreground">
              One workspace where conversations, tasks, and decisions stay
              connected. Here is why that matters.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
