import { Activity, FolderKanban, MessageSquareText, Users } from 'lucide-react'
import { ChapterLabel } from './ChapterLabel'

const FEATURES = [
  {
    icon: Users,
    title: 'Workspaces that hold the team',
    body: 'Members, roles, and invites in one place, so access and ownership stay clear as you grow.',
    image: '/marketing/grasyn-feature-workspaces.png',
    imageAlt: 'Illustration of a workspace with teammates and invites connected together',
  },
  {
    icon: FolderKanban,
    title: 'Projects and tasks with context',
    body: 'Priorities, owners, due dates, and status sit next to the work, not in another tool.',
    image: '/marketing/grasyn-feature-projects.png',
    imageAlt: 'Illustration of a project board with task cards across columns',
  },
  {
    icon: MessageSquareText,
    title: 'Comments where decisions happen',
    body: 'Discuss the task on the task. The reasoning stays attached to the work.',
    image: '/marketing/grasyn-feature-comments.png',
    imageAlt: 'Illustration of comments and a decision attached directly to a task',
  },
  {
    icon: Activity,
    title: 'Activity you can catch up on',
    body: 'See exactly what changed, who changed it, and what needs you when you come back.',
    image: '/marketing/grasyn-feature-activity.png',
    imageAlt: 'Illustration of an activity timeline showing recent team events',
    live: true,
  },
]

export function ChapterFeatures() {
  return (
    <section
      id="features"
      data-nav-theme="light"
      className="border-t border-border bg-surface-muted/50 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div data-reveal className="max-w-2xl">
          <ChapterLabel index={5}>What you get</ChapterLabel>
          <h2 className="mt-4 font-display text-h1 font-semibold tracking-tight sm:text-display-lg">
            Everything your team needs, already connected.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <article
                key={feature.title}
                data-reveal
                className="group flex flex-col gap-5 rounded-3xl border border-border bg-surface p-5 transition duration-500 ease-glide hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
              >
                <div className="relative overflow-hidden rounded-2xl">
                  <img
                    src={feature.image}
                    alt={feature.imageAlt}
                    loading="lazy"
                    className="aspect-[16/9] w-full object-cover transition duration-700 ease-glide group-hover:scale-[1.04]"
                  />
                  {feature.live ? (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-1 text-caption font-medium shadow-sm backdrop-blur">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full rounded-full bg-success-500 opacity-60 motion-safe:animate-ping" />
                        <span className="relative inline-flex size-2 rounded-full bg-success-500" />
                      </span>
                      Live
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-4 px-1 pb-1">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition duration-300 group-hover:scale-110">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-h4 font-semibold tracking-tight">
                      {feature.title}
                    </h3>
                    <p className="mt-1.5 text-body text-muted-foreground">{feature.body}</p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
