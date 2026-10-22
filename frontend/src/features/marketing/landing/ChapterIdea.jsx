import { useRef } from 'react'
import { ChapterLabel } from './ChapterLabel'
import { gsap, MOTION, useGSAP } from './gsap'

const VIEW = 420
const C = VIEW / 2
const R = 60
const GAP = Math.sqrt(3) * R + 6

const CELLS = [
  { label: 'GraSyn', x: C, y: C, core: true },
  ...['People', 'Projects', 'Tasks', 'Conversations', 'Decisions', 'History'].map(
    (label, index) => {
      const rad = ((30 + index * 60) * Math.PI) / 180
      return { label, x: C + GAP * Math.cos(rad), y: C + GAP * Math.sin(rad) }
    },
  ),
]

function hexPoints(x, y, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const rad = (i * 60 * Math.PI) / 180
    return `${(x + r * Math.cos(rad)).toFixed(1)},${(y + r * Math.sin(rad)).toFixed(1)}`
  }).join(' ')
}

export function ChapterIdea() {
  const root = useRef(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.motion, () => {
        gsap
          .timeline({
            scrollTrigger: {
              trigger: root.current,
              start: 'top 70%',
              end: 'center 55%',
              scrub: 0.8,
            },
          })
          .from('[data-word="gra"]', { xPercent: -40, opacity: 0, ease: 'power2.out' }, 0)
          .from('[data-word="syn"]', { xPercent: 40, opacity: 0, ease: 'power2.out' }, 0)
          .from('[data-plus]', { scale: 0, rotate: -90, opacity: 0 }, 0.2)
          .from('[data-hex-line]', { drawSVG: 0, stagger: 0.08, ease: 'none' }, 0.1)
          .from('[data-hex-fill]', { opacity: 0, stagger: 0.06 }, 0.5)
          .from(
            '[data-hex-label]',
            { opacity: 0, y: 8, stagger: 0.06, ease: 'back.out(2)' },
            0.6,
          )
      })
    },
    { scope: root },
  )

  return (
    <section
      ref={root}
      id="idea"
      data-nav-theme="light"
      className="relative overflow-hidden bg-background py-24 sm:py-32"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
        <div>
          <ChapterLabel index={3}>The idea</ChapterLabel>
          <h2 className="mt-6 flex flex-wrap items-baseline gap-x-4 font-display text-display-lg font-semibold tracking-tight sm:text-display-xl">
            <span data-word="gra" className="inline-block text-primary">
              GRA
            </span>
            <span data-plus className="inline-block text-muted-foreground">
              +
            </span>
            <span data-word="syn" className="inline-block">
              SYN
            </span>
          </h2>
          <dl className="mt-8 grid gap-6 sm:grid-cols-2">
            <div data-reveal className="rounded-2xl border border-border bg-surface p-5">
              <dt className="font-display text-h4 font-semibold text-primary">Graphene</dt>
              <dd className="mt-2 text-body-sm text-muted-foreground">
                The strongest material we know is just atoms, connected well.
                Structure is what makes it strong.
              </dd>
            </div>
            <div data-reveal className="rounded-2xl border border-border bg-surface p-5">
              <dt className="font-display text-h4 font-semibold">Synergy</dt>
              <dd className="mt-2 text-body-sm text-muted-foreground">
                People working as one achieve more than the same people working
                apart.
              </dd>
            </div>
          </dl>
          <p data-reveal className="mt-8 max-w-lg text-body-lg text-muted-foreground">
            GraSyn gives your team that structure: one environment where people,
            work, and knowledge strengthen each other instead of competing for
            attention.
          </p>
        </div>

        <figure className="relative mx-auto w-full max-w-[460px]">
          <div aria-hidden="true" className="lp-dot-grid-light absolute -inset-10" />
          <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="relative w-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id="lp-core" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#6695b9" />
                <stop offset="100%" stopColor="#244b72" />
              </linearGradient>
            </defs>
            {CELLS.map((cell) => (
              <g key={cell.label}>
                <polygon
                  data-hex-fill
                  points={hexPoints(cell.x, cell.y, R - 2)}
                  fill={cell.core ? 'url(#lp-core)' : '#ffffff'}
                  className={cell.core ? '' : 'drop-shadow-sm'}
                />
                <polygon
                  data-hex-line
                  points={hexPoints(cell.x, cell.y, R)}
                  fill="none"
                  stroke={cell.core ? '#3368a0' : '#bdd4e6'}
                  strokeWidth={cell.core ? 2.5 : 1.5}
                  strokeLinejoin="round"
                />
                <text
                  data-hex-label
                  x={cell.x}
                  y={cell.y + 5}
                  textAnchor="middle"
                  className={`font-display ${cell.core ? 'fill-white text-[17px] font-semibold' : 'fill-neutral-700 text-[13px] font-medium'}`}
                >
                  {cell.label}
                </text>
              </g>
            ))}
          </svg>
          <figcaption className="sr-only">
            GraSyn at the centre, connected to people, projects, tasks,
            conversations, decisions, and history.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
