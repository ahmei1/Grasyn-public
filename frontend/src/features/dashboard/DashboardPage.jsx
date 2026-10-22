import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock3,
  FolderKanban,
  ListTodo,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { activityHref, activitySentence } from '../../shared/lib/activity'
import {
  formatDate,
  formatRelativeTime,
  isOverdue,
  toDateInput,
} from '../../shared/lib/format'
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
  TASK_STATUSES,
} from '../../shared/lib/labels'
import { isWorkspaceManager } from '../../shared/lib/permissions'
import { Badge } from '../../shared/ui/Badge'
import { QueryError, Skeleton } from '../../shared/ui/PageState'
import { TaskKey } from '../../shared/ui/TaskKey'

const STATUS_BAR = {
  TODO: 'bg-neutral-400',
  IN_PROGRESS: 'bg-brand-500',
  IN_REVIEW: 'bg-warning-500',
  DONE: 'bg-success-500',
}

const PRIORITY_DOT = {
  LOW: 'bg-neutral-300',
  MEDIUM: 'bg-brand-400',
  HIGH: 'bg-warning-500',
  URGENT: 'bg-error-500',
}

const linkFocus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

export function DashboardPage() {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace.id

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.dashboard(workspaceId),
    queryFn: () => api.get(`/workspaces/${workspaceId}/dashboard`),
  })

  if (isPending) return <DashboardSkeleton />
  if (isError) return <QueryError error={error} onRetry={refetch} />

  const summary = data.summary ?? {}
  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const manager = isWorkspaceManager(activeWorkspace.role)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
            {new Intl.DateTimeFormat('en', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(new Date())}
          </p>
          <h1 className="mt-1 font-display text-h1 font-semibold tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 max-w-xl text-body-sm text-muted-foreground">
            {focusSentence(summary)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/tasks"
            className={clsx(
              'inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-body-sm font-medium hover:bg-surface-muted',
              linkFocus,
            )}
          >
            <ListTodo aria-hidden="true" className="size-4" />
            My tasks
          </Link>
          <Link
            to="/app/projects"
            className={clsx(
              'inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-body-sm font-medium text-primary-foreground hover:bg-primary-hover',
              linkFocus,
            )}
          >
            <FolderKanban aria-hidden="true" className="size-4" />
            Projects
          </Link>
        </div>
      </header>

      <GettingStarted summary={summary} manager={manager} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ProgressHero summary={summary} workspaceName={activeWorkspace.name} />
        <YourWeek summary={summary} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AttentionCard data={data} summary={summary} />
          <Card
            title="Assigned to you"
            subtitle={`${summary.myOpenTasks ?? data.myTasks?.length ?? 0} open`}
            to="/app/tasks"
            linkLabel="View all"
          >
            {data.myTasks?.length ? (
              <ul className="divide-y divide-border">
                {data.myTasks.map((task) => (
                  <TaskRow key={task.id} task={task} showStatus />
                ))}
              </ul>
            ) : (
              <CardEmpty
                icon={CheckCircle2}
                title="Nothing on your plate"
                description="Tasks assigned to you will show up here."
              />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <PipelineCard counts={data.taskCounts ?? {}} total={summary.totalTasks ?? 0} />
          <Card title="Project health" to="/app/projects" linkLabel="All projects">
            {data.projectHealth?.length ? (
              <ul className="divide-y divide-border">
                {data.projectHealth.map((project) => (
                  <ProjectHealthRow key={project.id} project={project} />
                ))}
              </ul>
            ) : (
              <CardEmpty
                icon={FolderKanban}
                title="No projects yet"
                description="Project progress appears once you create a project."
              />
            )}
          </Card>
          <Card title="Recent activity" to="/app/activity" linkLabel="Full feed">
            {data.recentActivity?.length ? (
              <ActivityTimeline events={data.recentActivity.slice(0, 8)} />
            ) : (
              <CardEmpty
                icon={Clock3}
                title="Quiet so far"
                description="Team activity shows up as people create and update work."
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function focusSentence(summary) {
  const mine = summary.myOpenTasks ?? 0
  const myOverdue = summary.myOverdueTasks ?? 0
  if (mine === 0) {
    return 'You have no open tasks assigned to you. Pick something from a project or check on your team below.'
  }
  const overdue = myOverdue > 0 ? `, ${myOverdue} of them overdue` : ''
  return `You have ${plural(mine, 'open task')}${overdue}. Here is what needs attention today.`
}

function dueLabel(iso) {
  const due = toDateInput(iso)
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  if (due === today) return { text: 'Due today', tone: 'warning' }
  if (due === tomorrow) return { text: 'Due tomorrow', tone: 'muted' }
  if (isOverdue(iso)) return { text: `Overdue · ${formatDate(iso)}`, tone: 'error' }
  return { text: `Due ${formatDate(iso)}`, tone: 'muted' }
}

function initials(name) {
  return (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function Avatar({ name, className }) {
  return (
    <span
      title={name}
      aria-hidden="true"
      className={clsx(
        'grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

function Card({ title, subtitle, to, linkLabel, children, className }) {
  return (
    <section
      className={clsx(
        'overflow-hidden rounded-2xl border border-border bg-surface shadow-xs',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-body font-semibold">{title}</h2>
          {subtitle ? (
            <span className="text-caption text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
        {to ? (
          <Link
            to={to}
            className={clsx(
              'inline-flex items-center gap-1 rounded text-caption font-medium text-primary hover:underline',
              linkFocus,
            )}
          >
            {linkLabel}
            <ArrowRight aria-hidden="true" className="size-3" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function CardEmpty({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-surface-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-body-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function GettingStarted({ summary, manager }) {
  const steps = [
    {
      done: (summary.activeProjects ?? 0) > 0,
      label: 'Create your first project',
      to: '/app/projects',
    },
    {
      done: (summary.totalTasks ?? 0) > 0,
      label: 'Add a task to a project',
      to: '/app/projects',
    },
    ...(manager
      ? [
          {
            done: (summary.memberCount ?? 0) > 1,
            label: 'Invite a teammate',
            to: '/app/settings/workspace',
          },
        ]
      : []),
  ]
  const remaining = steps.filter((step) => !step.done).length
  if (remaining === 0) return null

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-body font-semibold">Set up your workspace</h2>
        <span className="text-caption text-muted-foreground">
          {steps.length - remaining} of {steps.length} done
        </span>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              to={step.to}
              className={clsx(
                'flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-body-sm hover:bg-surface-muted',
                linkFocus,
                step.done && 'text-muted-foreground line-through',
              )}
            >
              {step.done ? (
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success-600" />
              ) : (
                <Circle aria-hidden="true" className="size-4 shrink-0 text-primary" />
              )}
              {step.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ProgressHero({ summary, workspaceName }) {
  const total = summary.totalTasks ?? 0
  const done = summary.doneTasks ?? 0
  const percent = total ? Math.round((done / total) * 100) : 0

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-6 text-white shadow-sm lg:col-span-2">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl"
      />
      <p className="text-caption font-medium uppercase tracking-wide text-white/70">
        {workspaceName} progress
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
        <p className="font-display text-display-lg font-semibold leading-none">{percent}%</p>
        <p className="pb-1 text-body-sm text-white/80">
          {total ? `${done} of ${plural(total, 'task')} done` : 'No tasks yet'}
        </p>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"
        role="progressbar"
        aria-label="Tasks completed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full bg-white transition-[width] duration-700 ease-glide"
          style={{ width: `${percent}%` }}
        />
      </div>
      <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-white/15 pt-4">
        <HeroMetric label="Open tasks" value={summary.openTasks ?? 0} />
        <HeroMetric label="Active projects" value={summary.activeProjects ?? 0} />
        <HeroMetric label="Teammates" value={summary.memberCount ?? 0} />
      </dl>
    </section>
  )
}

function HeroMetric({ label, value }) {
  return (
    <div>
      <dt className="text-caption text-white/70">{label}</dt>
      <dd className="mt-0.5 font-display text-h3 font-semibold">{value}</dd>
    </div>
  )
}

function YourWeek({ summary }) {
  const items = [
    {
      icon: AlertTriangle,
      label: 'Overdue in workspace',
      value: summary.overdueTasks ?? 0,
      tone: 'error',
    },
    {
      icon: CalendarClock,
      label: 'Due in the next 7 days',
      value: summary.upcomingTasks ?? 0,
      tone: 'info',
    },
    {
      icon: Clock3,
      label: 'No update for a week',
      value: summary.staleTasks ?? 0,
      tone: 'warning',
    },
    {
      icon: Bell,
      label: 'Unread notifications',
      value: summary.unreadCount ?? 0,
      tone: 'primary',
    },
  ]
  const tones = {
    error: 'bg-error-100 text-error-700',
    info: 'bg-info-100 text-info-700',
    warning: 'bg-warning-100 text-warning-700',
    primary: 'bg-primary/10 text-primary',
    muted: 'bg-surface-muted text-muted-foreground',
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
      <h2 className="font-display text-body font-semibold">At a glance</h2>
      <ul className="mt-4 space-y-3">
        {items.map(({ icon: Icon, label, value, tone }) => (
          <li key={label} className="flex items-center gap-3">
            <span
              className={clsx(
                'grid size-9 shrink-0 place-items-center rounded-lg',
                value > 0 ? tones[tone] : tones.muted,
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="flex-1 text-body-sm text-muted-foreground">{label}</span>
            <span className="font-display text-h4 font-semibold tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AttentionCard({ data, summary }) {
  const tabs = [
    {
      id: 'overdue',
      label: 'Overdue',
      count: summary.overdueTasks ?? 0,
      tasks: data.overdueTasks ?? [],
      empty: 'Nothing is overdue. Nice work.',
    },
    {
      id: 'upcoming',
      label: 'Due this week',
      count: summary.upcomingTasks ?? 0,
      tasks: data.upcomingTasks ?? [],
      empty: 'Nothing is due in the next 7 days.',
    },
    {
      id: 'stale',
      label: 'Needs a nudge',
      count: summary.staleTasks ?? 0,
      tasks: data.staleTasks ?? [],
      empty: 'Every open task was updated this week.',
      stale: true,
    },
  ]
  const firstWithWork = tabs.find((tab) => tab.count > 0)?.id ?? 'overdue'
  const [selected, setSelected] = useState(null)
  const activeId = selected ?? firstWithWork
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="font-display text-body font-semibold">Needs attention</h2>
        <div role="tablist" aria-label="Attention filters" className="flex gap-1 rounded-lg bg-surface-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === active.id}
              onClick={() => setSelected(tab.id)}
              className={clsx(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-caption font-medium transition-colors',
                linkFocus,
                tab.id === active.id
                  ? 'bg-surface text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span
                className={clsx(
                  'rounded-full px-1.5 tabular-nums',
                  tab.count > 0 && tab.id === 'overdue'
                    ? 'bg-error-100 text-error-700'
                    : 'bg-background text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>
      {active.tasks.length ? (
        <ul role="tabpanel" className="divide-y divide-border">
          {active.tasks.map((task) => (
            <TaskRow key={task.id} task={task} showAssignee stale={active.stale} />
          ))}
          {active.count > active.tasks.length ? (
            <li className="px-5 py-2.5 text-caption text-muted-foreground">
              Showing {active.tasks.length} of {active.count}.
            </li>
          ) : null}
        </ul>
      ) : (
        <div role="tabpanel">
          <CardEmpty icon={CheckCircle2} title="All clear" description={active.empty} />
        </div>
      )}
    </section>
  )
}

function TaskRow({ task, showStatus = false, showAssignee = false, stale = false }) {
  const due = task.dueDate ? dueLabel(task.dueDate) : null
  const dueTone = {
    error: 'text-error-600',
    warning: 'text-warning-700',
    muted: 'text-muted-foreground',
  }

  return (
    <li>
      <Link
        to={`/app/tasks/${task.id}`}
        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span
          title={`${TASK_PRIORITY_LABELS[task.priority] ?? 'Medium'} priority`}
          className={clsx(
            'size-2 shrink-0 rounded-full',
            PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.MEDIUM,
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline gap-2 text-body-sm">
            <TaskKey task={task} />
            <span className="truncate font-medium">{task.title}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-caption text-muted-foreground">
            <span className="truncate">{task.project?.name}</span>
            {stale ? (
              <span>Updated {formatRelativeTime(task.updatedAt)}</span>
            ) : due ? (
              <span className={dueTone[due.tone]}>{due.text}</span>
            ) : null}
          </p>
        </div>
        {showStatus ? (
          <Badge tone={TASK_STATUS_TONE[task.status]}>
            {TASK_STATUS_LABELS[task.status]}
          </Badge>
        ) : null}
        {showAssignee ? (
          task.assignee ? (
            <Avatar name={task.assignee.name} />
          ) : (
            <span className="text-caption text-muted-foreground">Unassigned</span>
          )
        ) : null}
      </Link>
    </li>
  )
}

function PipelineCard({ counts, total }) {
  return (
    <Card title="Task pipeline" subtitle={plural(total, 'task')}>
      <div className="px-5 py-4">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted">
          {total
            ? TASK_STATUSES.map((status) =>
                counts[status] ? (
                  <div
                    key={status}
                    className={STATUS_BAR[status]}
                    style={{ width: `${(counts[status] / total) * 100}%` }}
                  />
                ) : null,
              )
            : null}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {TASK_STATUSES.map((status) => (
            <li key={status} className="flex items-center gap-2">
              <span className={clsx('size-2.5 rounded-sm', STATUS_BAR[status])} />
              <span className="flex-1 text-caption text-muted-foreground">
                {TASK_STATUS_LABELS[status]}
              </span>
              <span className="text-body-sm font-semibold tabular-nums">
                {counts[status] ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function ProjectHealthRow({ project }) {
  const percent = project.totalTasks
    ? Math.round((project.doneTasks / project.totalTasks) * 100)
    : 0
  const state =
    project.overdueTasks > 0
      ? { tone: 'error', label: `${project.overdueTasks} overdue`, bar: 'bg-error-500' }
      : project.staleTasks > 0
        ? { tone: 'warning', label: `${project.staleTasks} stale`, bar: 'bg-warning-500' }
        : { tone: 'success', label: 'On track', bar: 'bg-success-500' }

  return (
    <li>
      <Link
        to={`/app/projects/${project.id}`}
        className="block px-5 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-body-sm font-medium">{project.name}</p>
          {project.totalTasks ? <Badge tone={state.tone}>{state.label}</Badge> : null}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={clsx('h-full rounded-full', state.bar)}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="w-24 text-right text-caption text-muted-foreground tabular-nums">
            {project.totalTasks
              ? `${project.doneTasks}/${project.totalTasks} done`
              : 'No tasks yet'}
          </span>
        </div>
      </Link>
    </li>
  )
}

function ActivityTimeline({ events }) {
  return (
    <ol className="px-5 py-4">
      {events.map((event, index) => (
        <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < events.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-3.5 top-8 w-px bg-border"
            />
          ) : null}
          <Avatar name={event.actor?.name} />
          <Link
            to={activityHref(event)}
            className={clsx('min-w-0 flex-1 rounded hover:underline', linkFocus)}
          >
            <p className="text-body-sm leading-snug">{activitySentence(event)}</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {formatRelativeTime(event.createdAt)}
            </p>
          </Link>
        </li>
      ))}
    </ol>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  )
}
