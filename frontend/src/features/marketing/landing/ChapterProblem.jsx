import { useRef } from 'react'
import { Hash } from 'lucide-react'
import { ChapterLabel } from './ChapterLabel'
import { gsap, MOTION, useGSAP } from './gsap'

const NOISE = [
  { who: 'Omar', text: 'Lunch at 1?', time: '10:04' },
  { who: 'Lina', text: 'Staging is red again 😬', time: '10:11' },
  { who: 'Sara', text: 'Who has the AWS key?', time: '11:40' },
  { who: 'Omar', text: 'Sending the deck now', time: 'Tue 09:15' },
  { who: 'Lina', text: 'PR #41 needs one more review', time: 'Tue 14:02' },
  { who: 'Ahmed', text: 'Moving standup to 9:45', time: 'Wed 08:30' },
  { who: 'Sara', text: 'Anyone seen the new mockups?', time: 'Wed 16:20' },
  { who: 'Omar', text: '🎉 v1.3 is live', time: 'Thu 18:05' },
]

const CAPTIONS = [
  {
    day: 'Monday, 10:02',
    text: 'A decision is made in chat: the team will use Postgres.',
  },
  {
    day: 'Wednesday',
    text: 'Two hundred messages later, the decision is buried.',
  },
  {
    day: 'Friday',
    text: 'Nobody remembers it. Someone rebuilds the story by hand, again.',
  },
]

export function ChapterProblem() {
  const root = useRef(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.story, () => {
        root.current.classList.add('is-animated')
        const captions = gsap.utils.toArray('[data-caption]')
        const noise = gsap.utils.toArray('[data-noise]')
        const windowHeight = root.current.querySelector('.lp-chat-window').clientHeight
        const list = root.current.querySelector('[data-chat-list]')

        gsap.set(captions.slice(1), { opacity: 0, y: 24 })
        gsap.set(noise, { opacity: 0, y: 16 })
        gsap.set('[data-question]', { opacity: 0, y: 16 })
        gsap.set('[data-day]:not(:first-child)', { opacity: 0 })

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: root.current,
            start: 'top top',
            end: '+=220%',
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        })

        tl.to('[data-decision]', { boxShadow: '0 0 0 2px rgb(51 104 160 / 0.6)', duration: 0.1 }, 0)
          .to(noise, { opacity: 1, y: 0, stagger: 0.08, duration: 0.12 }, 0.15)
          .to(
            list,
            { y: () => -(list.scrollHeight - windowHeight + 24), duration: 0.5 },
            0.38,
          )
          .to('[data-decision]', { boxShadow: '0 0 0 0px rgb(51 104 160 / 0)', opacity: 0.45, duration: 0.2 }, 0.3)
          .to(captions[0], { opacity: 0, y: -24, duration: 0.08 }, 0.3)
          .to(captions[1], { opacity: 1, y: 0, duration: 0.08 }, 0.36)
          .to('[data-day]:nth-child(1)', { opacity: 0, duration: 0.05 }, 0.3)
          .to('[data-day]:nth-child(2)', { opacity: 1, duration: 0.05 }, 0.33)
          .to(captions[1], { opacity: 0, y: -24, duration: 0.08 }, 0.7)
          .to(captions[2], { opacity: 1, y: 0, duration: 0.08 }, 0.76)
          .to('[data-day]:nth-child(2)', { opacity: 0, duration: 0.05 }, 0.7)
          .to('[data-day]:nth-child(3)', { opacity: 1, duration: 0.05 }, 0.73)
          .to('[data-question]', { opacity: 1, y: 0, duration: 0.1 }, 0.85)

        return () => root.current?.classList.remove('is-animated')
      })
    },
    { scope: root },
  )

  return (
    <section
      ref={root}
      id="problem"
      data-nav-theme="light"
      className="relative bg-background"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:min-h-svh lg:grid-cols-2 lg:gap-16">
        <div>
          <ChapterLabel index={1}>The problem</ChapterLabel>
          <h2 className="mt-4 font-display text-h1 font-semibold tracking-tight sm:text-display-lg">
            A decision made on Monday is lost by Friday.
          </h2>
          <div className="lp-stack mt-8">
            {CAPTIONS.map((caption) => (
              <div key={caption.day} data-caption className="border-l-2 border-primary/40 pl-4">
                <p className="text-caption font-semibold uppercase tracking-wider text-primary">
                  {caption.day}
                </p>
                <p className="mt-1 text-body-lg text-muted-foreground">{caption.text}</p>
              </div>
            ))}
          </div>
        </div>

        <figure
          aria-label="A chat channel where an important decision gets buried under other messages"
          className="overflow-hidden rounded-3xl border border-border bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <p className="flex items-center gap-1.5 text-body-sm font-semibold">
              <Hash aria-hidden="true" className="size-4 text-muted-foreground" />
              backend
            </p>
            <p className="relative h-5 w-28 text-right text-caption text-muted-foreground">
              <span className="lp-static-only">Monday → Friday</span>
              <span className="lp-motion-only">
                {['Monday', 'Wednesday', 'Friday'].map((day) => (
                  <span key={day} data-day className="absolute inset-0">
                    {day}
                  </span>
                ))}
              </span>
            </p>
          </div>

          <div className="lp-chat-window relative overflow-hidden">
            <ul data-chat-list className="space-y-3 p-5">
              <li data-decision className="rounded-2xl bg-primary/8 p-3">
                <Message who="Ahmed" time="Mon 10:02" highlight>
                  <strong>Decision:</strong> we use Postgres, not Mongo.
                </Message>
              </li>
              {NOISE.map((message) => (
                <li key={message.time} data-noise className="px-3">
                  <Message who={message.who} time={message.time}>
                    {message.text}
                  </Message>
                </li>
              ))}
              <li data-question className="rounded-2xl bg-error-50 p-3">
                <Message who="Sara" time="Fri 11:20">
                  Wait… which database did we pick? 🤔
                </Message>
              </li>
            </ul>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-surface to-transparent"
            />
          </div>
        </figure>
      </div>
    </section>
  )
}

const AVATAR_TONES = {
  Ahmed: 'bg-brand-100 text-brand-700',
  Sara: 'bg-success-100 text-success-700',
  Omar: 'bg-warning-100 text-warning-700',
  Lina: 'bg-ai-100 text-ai-700',
}

function Message({ who, time, highlight = false, children }) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className={`grid size-8 shrink-0 place-items-center rounded-full text-caption font-semibold ${AVATAR_TONES[who]}`}
      >
        {who[0]}
      </span>
      <div className="min-w-0">
        <p className="text-caption">
          <span className="font-semibold text-foreground">{who}</span>{' '}
          <span className="text-muted-foreground">{time}</span>
        </p>
        <p className={`mt-0.5 text-body-sm ${highlight ? 'text-foreground' : 'text-muted-foreground'}`}>
          {children}
        </p>
      </div>
    </div>
  )
}
