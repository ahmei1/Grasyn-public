import { useRef } from 'react'
import { Check, FileText, KanbanSquare, MessageSquare, Video } from 'lucide-react'
import { ChapterLabel } from './ChapterLabel'
import { gsap, MOTION, useGSAP } from './gsap'

// Per-person basic plans from the Story & Vision v2.1 comparison, × 10 people.
const STACK = [
  { icon: MessageSquare, label: 'Team chat', cost: 72.5 },
  { icon: KanbanSquare, label: 'Task board', cost: 90.5 },
  { icon: FileText, label: 'Docs & wiki', cost: 100 },
  { icon: Video, label: 'Video calls', cost: 141.6 },
]
const STACK_TOTAL = 405
const GRASYN_TOTAL = 120
const MAX = Math.max(...STACK.map((tool) => tool.cost))

const INCLUDED = [
  'Projects, tasks, and boards',
  'Comments on the work itself',
  'Activity history you can catch up on',
  'Chat and calls (coming in Phase 2)',
]

const money = (value) =>
  `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export function ChapterCost() {
  const root = useRef(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.motion, () => {
        const counters = gsap.utils.toArray('[data-count]')
        counters.forEach((node) => (node.textContent = money(0)))

        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: 'top 65%', once: true },
          defaults: { ease: 'power3.out' },
        })
        tl.from('[data-tool]', { opacity: 0, x: -24, duration: 0.6, stagger: 0.12 })
          .from(
            '[data-bar]',
            { scaleX: 0, transformOrigin: 'left center', duration: 0.9, stagger: 0.12 },
            0.1,
          )
          .to(
            { value: 0 },
            {
              value: STACK_TOTAL,
              duration: 1.4,
              ease: 'power2.out',
              onUpdate() {
                counters[0].textContent = money(this.targets()[0].value)
              },
            },
            0.2,
          )
          .from('[data-grasyn]', { opacity: 0, y: 40, scale: 0.96, duration: 0.9 }, 0.9)
          .to(
            { value: 0 },
            {
              value: GRASYN_TOTAL,
              duration: 1.1,
              ease: 'power2.out',
              onUpdate() {
                counters[1].textContent = money(this.targets()[0].value)
              },
            },
            1.1,
          )
          .from('[data-included]', { opacity: 0, x: 16, duration: 0.5, stagger: 0.08 }, 1.3)
          .from('[data-saving]', { opacity: 0, scale: 0.8, duration: 0.6, ease: 'back.out(2)' }, 1.9)
      })
    },
    { scope: root },
  )

  return (
    <section
      ref={root}
      data-nav-theme="light"
      className="relative border-y border-border bg-surface-muted/60 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div data-reveal className="max-w-2xl">
          <ChapterLabel index={2}>The cost</ChapterLabel>
          <h2 className="mt-4 font-display text-h1 font-semibold tracking-tight sm:text-display-lg">
            Four tools. One team. A bill every month.
          </h2>
          <p className="mt-4 text-body-lg text-muted-foreground">
            Every app charges per person. For a team of ten, the usual stack
            adds up fast, and the context is still split four ways.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              The usual stack · 10 people
            </p>
            <ul className="mt-6 space-y-5">
              {STACK.map((tool) => {
                const Icon = tool.icon
                return (
                  <li key={tool.label} data-tool className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-surface-muted text-muted-foreground">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <div>
                      <p className="text-body-sm font-medium">{tool.label}</p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-surface-muted">
                        <div
                          data-bar
                          className="h-full rounded-full bg-neutral-400"
                          style={{ width: `${(tool.cost / MAX) * 100}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-body-sm font-semibold tabular-nums">
                      ${tool.cost.toFixed(2)}
                    </p>
                  </li>
                )
              })}
            </ul>
            <div className="mt-8 flex items-end justify-between border-t border-border pt-5">
              <p className="text-body-sm text-muted-foreground">Every month</p>
              <p className="font-display text-display-lg font-semibold leading-none tabular-nums">
                <span data-count>{money(STACK_TOTAL)}</span>
              </p>
            </div>
          </div>

          <div
            data-grasyn
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-6 text-white shadow-xl sm:p-8"
          >
            <div aria-hidden="true" className="lp-dot-grid absolute inset-0 opacity-50" />
            <div className="relative">
              <p className="text-caption font-semibold uppercase tracking-wider text-white/70">
                GraSyn Team · 10 people
              </p>
              <ul className="mt-6 space-y-3">
                {INCLUDED.map((item) => (
                  <li key={item} data-included className="flex items-center gap-3 text-body-sm text-white/90">
                    <span className="grid size-5 place-items-center rounded-full bg-white/15">
                      <Check aria-hidden="true" className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex items-end justify-between border-t border-white/15 pt-5">
                <p className="text-body-sm text-white/70">Every month</p>
                <p className="font-display text-display-lg font-semibold leading-none tabular-nums">
                  <span data-count>{money(GRASYN_TOTAL)}</span>
                </p>
              </div>
              <p
                data-saving
                className="mt-5 inline-flex rounded-full bg-white px-3 py-1 text-caption font-semibold text-brand-800"
              >
                Save about {money(STACK_TOTAL - GRASYN_TOTAL)} a month · {money((STACK_TOTAL - GRASYN_TOTAL) * 12)} a year
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-caption text-muted-foreground">
          Planned pricing. Stack prices are typical public per-person plans for
          chat, boards, docs, and video tools, multiplied by 10 people.
        </p>
      </div>
    </section>
  )
}
