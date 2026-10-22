import { Link } from 'react-router-dom'
import { Check, Sparkles } from 'lucide-react'
import { ChapterLabel } from './ChapterLabel'

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    note: 'forever, up to 5 members',
    features: ['Workspaces and roles', 'Projects, tasks, and boards', 'Comments and activity'],
  },
  {
    name: 'Team',
    price: '$12',
    note: 'per person / month',
    features: ['Everything in Free', 'Unlimited members', 'Chat and video calls (Phase 2)'],
    featured: true,
  },
  {
    name: 'Team + AI',
    price: '$18',
    note: 'per person / month',
    features: ['Everything in Team', 'AI summaries of what you missed', 'Clear monthly AI allowance'],
    ai: true,
  },
]

export function ChapterPricing({ cta }) {
  return (
    <section id="pricing" data-nav-theme="light" className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div data-reveal className="mx-auto max-w-2xl text-center">
          <div className="flex justify-center">
            <ChapterLabel index={6}>Pricing</ChapterLabel>
          </div>
          <h2 className="mt-4 font-display text-h1 font-semibold tracking-tight sm:text-display-lg">
            One tool, one fair price.
          </h2>
          <p className="mt-4 text-body-lg text-muted-foreground">
            Start free. Pay only when your team grows.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <article
              key={plan.name}
              data-reveal
              className={`relative flex flex-col rounded-3xl border p-7 transition duration-500 ease-glide hover:-translate-y-1 ${
                plan.featured
                  ? 'border-primary bg-surface shadow-xl ring-4 ring-primary/10'
                  : 'border-border bg-surface hover:shadow-lg'
              }`}
            >
              {plan.featured ? (
                <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-caption font-semibold text-primary-foreground">
                  Most teams
                </span>
              ) : null}
              <p className="flex items-center gap-2 font-display text-h4 font-semibold">
                {plan.name}
                {plan.ai ? <Sparkles aria-hidden="true" className="size-4 text-ai" /> : null}
              </p>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-display-lg font-semibold leading-none">
                  {plan.price}
                </span>
                <span className="text-body-sm text-muted-foreground">{plan.note}</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-body-sm">
                    <Check aria-hidden="true" className="size-4 shrink-0 text-success-600" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                to={cta.primary.to}
                viewTransition
                className={`mt-8 inline-flex h-11 items-center justify-center rounded-full text-body-sm font-medium transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                  plan.featured
                    ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
                    : 'border border-border hover:bg-surface-muted'
                }`}
              >
                {plan.name === 'Free' ? 'Start free' : `Choose ${plan.name}`}
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-6 text-center text-caption text-muted-foreground">
          Planned pricing. Final prices may change before paid plans launch.
        </p>
      </div>
    </section>
  )
}
