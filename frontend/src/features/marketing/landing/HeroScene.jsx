import { useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  FileText,
  GitPullRequest,
  MessageSquare,
  SquareCheckBig,
  Video,
} from 'lucide-react'
import { gsap, MOTION, ScrollTrigger, SplitText, useGSAP } from './gsap'

const SIZE = 560
const CENTER = SIZE / 2
const RADIUS = 200

// Six nodes on a hexagon around the core — the graphene cell behind "GRA".
const NODES = [-90, -30, 30, 90, 150, 210].map((deg) => {
  const rad = (deg * Math.PI) / 180
  return {
    x: CENTER + RADIUS * Math.cos(rad),
    y: CENTER + RADIUS * Math.sin(rad),
  }
})

// Where each fragment starts before the lattice pulls it into place.
const SCATTER = [
  { x: -70, y: -60, rotate: -11 },
  { x: 110, y: -80, rotate: 9 },
  { x: 130, y: 60, rotate: -7 },
  { x: 40, y: 110, rotate: 12 },
  { x: -140, y: 70, rotate: -9 },
  { x: -120, y: -90, rotate: 7 },
]

const FRAGMENTS = [
  {
    icon: MessageSquare,
    tag: '#backend',
    title: 'Switch to Postgres?',
    meta: 'Ahmed · 10:02',
    accent: 'text-brand-300',
  },
  {
    icon: SquareCheckBig,
    tag: 'Task',
    title: 'Migrate database',
    meta: 'In progress · Sara',
    accent: 'text-success-500',
  },
  {
    icon: GitPullRequest,
    tag: 'PR #42',
    title: 'Add auth flow',
    meta: '2 reviews waiting',
    accent: 'text-ai-500',
  },
  {
    icon: CalendarClock,
    tag: 'Calendar',
    title: 'Standup',
    meta: 'Tomorrow · 9:30',
    accent: 'text-warning-500',
  },
  {
    icon: FileText,
    tag: 'Doc',
    title: 'API spec v2',
    meta: 'Edited 2h ago',
    accent: 'text-info-500',
  },
  {
    icon: Video,
    tag: 'Call',
    title: 'Design sync',
    meta: '4 people · 30 min',
    accent: 'text-error-500',
  },
]

const percent = (value) => `${(value / SIZE) * 100}%`

export function HeroScene({ cta }) {
  const root = useRef(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add(
        { motion: MOTION.motion, story: MOTION.story },
        ({ conditions }) => {
          const fragments = gsap.utils.toArray('[data-fragment]')
          const lines = gsap.utils.toArray('[data-line]')
          const pulses = gsap.utils.toArray('[data-pulse]')
          const split = SplitText.create('[data-headline]', {
            type: 'words',
            wordsClass: 'inline-block',
          })

          const intro = gsap.timeline({ defaults: { ease: 'expo.out' } })
          intro
            .from('[data-backdrop]', { opacity: 0, duration: 1.2, ease: 'power2.out' }, 0)
            .from('[data-eyebrow]', { opacity: 0, y: 12, duration: 0.7 }, 0.1)
            .from(
              split.words,
              {
                opacity: 0,
                y: 28,
                filter: 'blur(10px)',
                duration: 0.9,
                stagger: 0.06,
              },
              0.2,
            )
            .from('[data-rise]', { opacity: 0, y: 20, duration: 0.8, stagger: 0.12 }, 0.75)
            .fromTo(
              fragments,
              {
                opacity: 0,
                scale: 0.85,
                x: (i) => SCATTER[i].x,
                y: (i) => SCATTER[i].y,
                rotate: (i) => SCATTER[i].rotate,
              },
              {
                opacity: 0.55,
                scale: 0.92,
                duration: 0.8,
                stagger: 0.1,
                ease: 'power2.out',
              },
              0.3,
            )
            .addLabel('connect', 1.5)
            .to(
              fragments,
              {
                opacity: 1,
                scale: 1,
                x: 0,
                y: 0,
                rotate: 0,
                duration: 1.3,
                stagger: 0.05,
                ease: 'expo.inOut',
              },
              'connect',
            )
            .from(
              lines,
              { drawSVG: 0, duration: 1.1, stagger: 0.04, ease: 'power2.inOut' },
              'connect+=0.35',
            )
            .from(
              '[data-core]',
              { scale: 0, rotate: -30, duration: 1, ease: 'back.out(2)' },
              'connect+=0.9',
            )
            .fromTo(
              '[data-core-ring]',
              { scale: 0.6, opacity: 0.8 },
              { scale: 2.4, opacity: 0, duration: 1.4, ease: 'power2.out' },
              'connect+=1.3',
            )

          // Calm loop after the intro: fragments breathe, data flows inward.
          const idle = gsap.timeline({ paused: true })
          fragments.forEach((fragment, index) => {
            idle.to(
              fragment.firstElementChild,
              {
                y: index % 2 ? 6 : -6,
                duration: 2.6 + (index % 3) * 0.5,
                ease: 'sine.inOut',
                yoyo: true,
                repeat: -1,
              },
              0,
            )
          })
          pulses.forEach((pulse, index) => {
            const node = NODES[index]
            const flow = gsap
              .timeline({ repeat: -1, repeatDelay: 2.4 + index * 0.35 })
              .fromTo(
                pulse,
                { attr: { cx: node.x, cy: node.y } },
                { attr: { cx: CENTER, cy: CENTER }, duration: 1.6, ease: 'power1.in' },
                0,
              )
              .fromTo(pulse, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0)
              .to(pulse, { opacity: 0, duration: 0.3 }, 1.3)
            idle.add(flow, index * 0.55)
          })
          intro.call(() => idle.play())

          const visibility = ScrollTrigger.create({
            trigger: root.current,
            start: 'top bottom',
            end: 'bottom top',
            onToggle: (self) => (self.isActive ? idle.resume() : idle.pause()),
          })

          let cleanupPointer = () => {}
          if (conditions.story) {
            gsap
              .timeline({
                scrollTrigger: {
                  trigger: root.current,
                  start: 'top top',
                  end: 'bottom top',
                  scrub: true,
                },
              })
              .to('[data-copy]', { y: -90, opacity: 0, ease: 'none' }, 0)
              .to('[data-scene-shell]', { scale: 0.82, y: 60, opacity: 0.25, ease: 'none' }, 0)

            const glowX = gsap.quickTo('[data-glow]', 'x', { duration: 0.8, ease: 'power3' })
            const glowY = gsap.quickTo('[data-glow]', 'y', { duration: 0.8, ease: 'power3' })
            const tiltX = gsap.quickTo('[data-parallax]', 'x', { duration: 1.2, ease: 'power3' })
            const tiltY = gsap.quickTo('[data-parallax]', 'y', { duration: 1.2, ease: 'power3' })
            const onMove = (event) => {
              const bounds = root.current.getBoundingClientRect()
              const px = event.clientX - bounds.left
              const py = event.clientY - bounds.top
              glowX(px - 300)
              glowY(py - 300)
              tiltX((px / bounds.width - 0.5) * -18)
              tiltY((py / bounds.height - 0.5) * -18)
            }
            root.current.addEventListener('pointermove', onMove)
            cleanupPointer = () => root.current?.removeEventListener('pointermove', onMove)
          }

          return () => {
            cleanupPointer()
            visibility.kill()
            split.revert()
          }
        },
      )
    },
    { scope: root },
  )

  return (
    <section
      ref={root}
      id="top"
      data-nav-theme="dark"
      className="dark relative isolate overflow-hidden bg-neutral-950 text-white"
    >
      <div data-backdrop aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="lp-dot-grid absolute inset-0" />
        <div className="absolute -top-40 right-[-10%] size-[42rem] rounded-full bg-brand-600/25 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-10%] size-[32rem] rounded-full bg-ai-600/10 blur-3xl" />
        <div data-glow className="lp-glow absolute left-0 top-0 size-[600px] rounded-full opacity-70" />
      </div>

      <div className="mx-auto grid min-h-svh max-w-6xl items-center gap-10 px-6 pb-24 pt-28 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pt-24">
        <div data-copy>
          <p
            data-eyebrow
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-caption font-medium text-white/80"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-success-500 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-success-500" />
            </span>
            Connected work for software teams
          </p>

          <h1
            data-headline
            className="mt-6 font-display text-h1 font-semibold tracking-tight sm:text-display-lg lg:text-display-xl"
          >
            Your team&apos;s context is everywhere.{' '}
            <span className="text-brand-300">Except in one place.</span>
          </h1>

          <p data-rise className="mt-6 max-w-lg text-body-lg text-white/70">
            Chat, tasks, reviews, and decisions live in different tools. GraSyn
            connects them, so nothing your team decides gets lost.
          </p>

          <div data-rise className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to={cta.primary.to}
              viewTransition
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-body font-medium text-neutral-950 transition duration-200 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {cta.primary.label}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
            <a
              href="#problem"
              className="inline-flex h-12 items-center rounded-full border border-white/20 px-6 text-body font-medium text-white/85 transition duration-200 hover:border-white/40 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              See the story
            </a>
          </div>

          <p data-rise className="mt-6 text-caption text-white/50">
            Free for teams up to 5 · No credit card needed
          </p>
        </div>

        <div data-scene-shell className="mx-auto w-full max-w-[560px]">
          <div data-parallax>
            <HeroLattice />
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-6 hidden flex-col items-center gap-2 text-caption text-white/50 md:flex"
      >
        <span className="flex h-8 w-5 justify-center rounded-full border border-white/30 pt-1.5">
          <span className="lp-scroll-dot block size-1 rounded-full bg-white" />
        </span>
        Scroll to see the story
      </div>
    </section>
  )
}

/** Exported so the closing chapter can show the finished, connected lattice. */
export function HeroLattice({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`relative aspect-square w-full [container-type:inline-size] ${className}`}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 size-full overflow-visible">
        <defs>
          <linearGradient id="lp-line" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#95b5cf" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#3368a0" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id="lp-pulse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#95b5cf" stopOpacity="0" />
          </radialGradient>
        </defs>
        {NODES.map((node, index) => {
          const next = NODES[(index + 1) % NODES.length]
          return (
            <g key={index}>
              <line
                data-line
                x1={node.x}
                y1={node.y}
                x2={next.x}
                y2={next.y}
                stroke="url(#lp-line)"
                strokeWidth="1.5"
              />
              <line
                data-line
                x1={node.x}
                y1={node.y}
                x2={CENTER}
                y2={CENTER}
                stroke="url(#lp-line)"
                strokeWidth="1"
                opacity="0.55"
              />
            </g>
          )
        })}
        {NODES.map((node, index) => (
          <circle key={index} data-pulse cx={node.x} cy={node.y} r="5" fill="url(#lp-pulse)" opacity="0" />
        ))}
      </svg>

      <div
        className="absolute"
        style={{ left: '50%', top: '50%', width: '24%', aspectRatio: '1', translate: '-50% -50%' }}
      >
        <span
          data-core-ring
          className="lp-hex absolute inset-0 bg-brand-400/40 opacity-0"
        />
        <div
          data-core
          className="lp-hex grid size-full place-items-center bg-gradient-to-br from-brand-400 via-brand-500 to-brand-800 shadow-[0_0_60px_rgb(51_104_160/0.6)]"
        >
          <span className="font-display text-[clamp(10px,3.4cqw,19px)] font-semibold tracking-tight text-white">
            GraSyn
          </span>
        </div>
      </div>

      <div className="absolute inset-0" style={{ fontSize: 'clamp(7px, 2.25cqw, 12.5px)' }}>
        {FRAGMENTS.map((fragment, index) => {
          const Icon = fragment.icon
          return (
            <div
              key={fragment.title}
              data-fragment
              className="absolute"
              style={{
                left: percent(NODES[index].x),
                top: percent(NODES[index].y),
                translate: '-50% -50%',
              }}
            >
              <div className="w-[12.5em] rounded-[1em] border border-white/12 bg-neutral-900/85 p-[0.85em] shadow-[0_10px_30px_rgb(0_0_0/0.45)] backdrop-blur-sm">
                <div className="flex items-center gap-[0.5em] text-[0.85em] text-white/55">
                  <Icon className={`size-[1.25em] ${fragment.accent}`} />
                  {fragment.tag}
                </div>
                <p className="mt-[0.35em] truncate text-[1.05em] font-semibold text-white">
                  {fragment.title}
                </p>
                <p className="mt-[0.15em] truncate text-[0.85em] text-white/50">{fragment.meta}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
