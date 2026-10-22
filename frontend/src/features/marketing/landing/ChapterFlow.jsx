import { useRef } from 'react'
import { CalendarClock, History, MessageSquareText, SquareCheckBig, TrendingUp } from 'lucide-react'
import { ChapterLabel } from './ChapterLabel'
import { gsap, MOTION, useGSAP } from './gsap'

const STEPS = [
  {
    icon: MessageSquareText,
    title: 'Conversation',
    text: 'An idea comes up in a comment, right where the work is.',
  },
  {
    icon: SquareCheckBig,
    title: 'Action',
    text: 'One click turns it into a task with an owner and a due date.',
  },
  {
    icon: TrendingUp,
    title: 'Progress',
    text: 'Everyone sees it move from To do to Done. No status meetings.',
  },
  {
    icon: History,
    title: 'Knowledge',
    text: 'The whole story stays in the history, linked to the original comment.',
  },
]

const COLUMNS = ['To do', 'In progress', 'Done']

export function ChapterFlow() {
  const root = useRef(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.story, () => {
        root.current.classList.add('is-animated')
        const stage = root.current.querySelector('[data-stage]')
        const card = root.current.querySelector('[data-card]')
        const columns = gsap.utils.toArray('[data-col]')
        const rail = gsap.utils.toArray('[data-rail-item]')

        // Column centres relative to the stage centre, re-measured on resize.
        const slot = (index) => () => {
          const col = columns[index]
          return col.offsetLeft + col.offsetWidth / 2 - stage.clientWidth / 2
        }
        const slotY = () => {
          const col = columns[0]
          return col.offsetTop + 44 + card.offsetHeight / 2 - stage.clientHeight / 2
        }

        gsap.set(rail.slice(1), { opacity: 0.35 })
        gsap.set('[data-board]', { opacity: 0 })
        gsap.set('[data-layer="task"], [data-layer="history"]', { opacity: 0 })
        gsap.set('[data-chip]:not(:first-child)', { opacity: 0 })
        gsap.set('[data-history-extra]', { opacity: 0, y: 12 })

        const tl = gsap.timeline({
          defaults: { ease: 'power2.inOut' },
          scrollTrigger: {
            trigger: root.current,
            start: 'top top',
            end: '+=300%',
            pin: true,
            scrub: 0.7,
            invalidateOnRefresh: true,
          },
        })

        const activate = (index, at) =>
          tl.to(rail, { opacity: (i) => (i === index ? 1 : 0.35), duration: 0.15 }, at)

        tl.to('[data-rail-fill]', { scaleY: 1, ease: 'none', duration: 4 }, 0)

        // 2 · Action: the comment becomes a task on the board.
        activate(1, 0.6)
        tl.to('[data-layer="comment"]', { opacity: 0, duration: 0.25 }, 0.6)
          .to('[data-layer="task"]', { opacity: 1, duration: 0.25 }, 0.75)
          .to('[data-board]', { opacity: 1, duration: 0.4 }, 0.7)
          .to(card, { x: slot(0), y: slotY, duration: 0.6 }, 0.8)

        // 3 · Progress: across the columns.
        activate(2, 1.5)
        tl.to(card, { x: slot(1), duration: 0.6 }, 1.5)
          .to('[data-chip]:nth-child(1)', { opacity: 0, duration: 0.1 }, 1.8)
          .to('[data-chip]:nth-child(2)', { opacity: 1, duration: 0.1 }, 1.8)
          .to(card, { x: slot(2), duration: 0.6 }, 2.3)
          .to('[data-chip]:nth-child(2)', { opacity: 0, duration: 0.1 }, 2.6)
          .to('[data-chip]:nth-child(3)', { opacity: 1, duration: 0.1 }, 2.6)

        // 4 · Knowledge: the card settles into the history.
        activate(3, 3.1)
        tl.to('[data-board]', { opacity: 0, duration: 0.3 }, 3.1)
          .to(card, { x: 0, y: 0, duration: 0.5 }, 3.15)
          .to('[data-layer="task"]', { opacity: 0, duration: 0.2 }, 3.25)
          .to('[data-layer="history"]', { opacity: 1, duration: 0.2 }, 3.35)
          .to('[data-history-extra]', { opacity: 1, y: 0, stagger: 0.08, duration: 0.25 }, 3.45)
          .to({}, { duration: 0.3 })

        return () => root.current?.classList.remove('is-animated')
      })
    },
    { scope: root },
  )

  return (
    <section
      ref={root}
      id="how-it-works"
      data-nav-theme="light"
      className="relative bg-background"
    >
      <div className="mx-auto flex max-w-6xl flex-col justify-center px-6 py-24 md:min-h-svh">
        <div data-reveal className="max-w-2xl">
          <ChapterLabel index={4}>How it works</ChapterLabel>
          <h2 className="mt-4 font-display text-h1 font-semibold tracking-tight sm:text-display-lg">
            From conversation to done, without losing the thread.
          </h2>
        </div>

        <div className="lp-flow-stage mt-12">
          <div className="grid grid-cols-[15rem_1fr] gap-10">
            <ol className="relative space-y-7 pl-6">
              <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-border" />
              <span
                data-rail-fill
                aria-hidden="true"
                className="absolute bottom-2 left-0 top-2 w-0.5 origin-top scale-y-0 rounded-full bg-primary"
              />
              {STEPS.map((step, index) => (
                <li key={step.title} data-rail-item>
                  <p className="text-caption font-semibold text-primary">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <p className="mt-1 font-display text-h4 font-semibold">{step.title}</p>
                  <p className="mt-1 text-body-sm text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>

            <div
              data-stage
              aria-hidden="true"
              className="relative h-[27rem] overflow-hidden rounded-3xl border border-border bg-surface shadow-xl"
            >
              <div className="lp-dot-grid-light absolute inset-0" />
              <div data-board className="absolute inset-x-5 bottom-5 top-5 grid grid-cols-3 gap-4">
                {COLUMNS.map((column) => (
                  <div key={column} data-col className="rounded-2xl bg-surface-muted/80 p-3">
                    <p className="text-caption font-semibold text-muted-foreground">{column}</p>
                    <div className="mt-3 space-y-2 pt-24">
                      <div className="h-12 rounded-xl border border-dashed border-border" />
                      <div className="h-12 rounded-xl border border-dashed border-border opacity-60" />
                    </div>
                  </div>
                ))}
              </div>

              <div
                data-history-extra
                className="absolute left-1/2 top-[18%] w-[19rem] -translate-x-1/2 rounded-xl border border-border bg-surface px-4 py-2.5 text-caption text-muted-foreground"
              >
                Ahmed commented on <strong className="text-foreground">Login page</strong> · Mon
              </div>

              <div
                data-card
                className="absolute left-1/2 top-1/2 grid w-[15rem] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-4 shadow-lg"
              >
                <div data-layer="comment" className="[grid-area:1/1]">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-brand-100 text-caption font-semibold text-brand-700">
                      A
                    </span>
                    <p className="text-caption">
                      <span className="font-semibold">Ahmed</span>{' '}
                      <span className="text-muted-foreground">commented</span>
                    </p>
                  </div>
                  <p className="mt-3 text-body-sm">We should add login with Google before launch.</p>
                  <p className="mt-3 text-caption text-muted-foreground">Reply · 👍 3</p>
                </div>

                <div data-layer="task" className="[grid-area:1/1]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-warning-100 px-2 py-0.5 text-[11px] font-semibold text-warning-700">
                      High
                    </span>
                    <span className="relative h-5 w-20">
                      {[
                        ['To do', 'bg-muted text-muted-foreground'],
                        ['In progress', 'bg-primary/10 text-primary'],
                        ['Done', 'bg-success-100 text-success-700'],
                      ].map(([label, tone]) => (
                        <span
                          key={label}
                          data-chip
                          className={`absolute right-0 top-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
                        >
                          {label}
                        </span>
                      ))}
                    </span>
                  </div>
                  <p className="mt-3 text-body-sm font-semibold">Add Google login</p>
                  <div className="mt-3 flex items-center justify-between text-caption text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock aria-hidden="true" className="size-3.5" />
                      Due 14 Oct
                    </span>
                    <span className="grid size-6 place-items-center rounded-full bg-success-100 text-[10px] font-semibold text-success-700">
                      S
                    </span>
                  </div>
                </div>

                <div data-layer="history" className="[grid-area:1/1]">
                  <p className="flex items-center gap-1.5 text-caption font-semibold text-primary">
                    <History aria-hidden="true" className="size-3.5" />
                    History
                  </p>
                  <p className="mt-2 text-body-sm">
                    <strong>Sara</strong> moved <strong>Add Google login</strong> to Done
                  </p>
                  <p className="mt-2 text-caption text-muted-foreground">
                    Linked to Ahmed&apos;s comment · searchable forever
                  </p>
                </div>
              </div>

              <div
                data-history-extra
                className="absolute bottom-[18%] left-1/2 w-[19rem] -translate-x-1/2 rounded-xl border border-border bg-surface px-4 py-2.5 text-caption text-muted-foreground"
              >
                Lina reviewed <strong className="text-foreground">PR #43</strong> · Thu
              </div>
            </div>
          </div>
        </div>

        <ol className="lp-flow-list mt-10 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            return (
              <li key={step.title} data-reveal className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <p className="text-caption font-semibold text-primary">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                </div>
                <p className="mt-4 font-display text-h4 font-semibold">{step.title}</p>
                <p className="mt-1 text-body-sm text-muted-foreground">{step.text}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
