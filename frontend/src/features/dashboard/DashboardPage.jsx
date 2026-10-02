import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { activityHref, activitySentence } from '../../shared/lib/activity'
import { formatRelativeTime, isOverdue } from '../../shared/lib/format'
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
  TASK_STATUSES,
} from '../../shared/lib/labels'
import { Badge } from '../../shared/ui/Badge'
import { EmptyState, QueryError, Skeleton } from '../../shared/ui/PageState'

export function DashboardPage() {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace.id

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.dashboard(workspaceId),
    queryFn: () => api.get(`/workspaces/${workspaceId}/dashboard`),
  })

  const firstName = user?.name?.split(' ')[0] ?? 'there'

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
        <Skeleton className="h-64 sm:col-span-2 lg:col-span-4" />
      </div>
    )
  }

  if (isError) {
    return <QueryError error={error} onRetry={refetch} />
  }

  const counts = data.taskCounts ?? {}

  return (
    <div>
      <h1 className="font-display text-h2 font-semibold tracking-tight">
        Welcome back, {firstName}
      </h1>
      <p className="mt-1 text-body-sm text-muted-foreground">
        {activeWorkspace.name} — here is what needs you today.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <div
            key={status}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <p className="text-caption text-muted-foreground">
              {TASK_STATUS_LABELS[status]}
            </p>
            <p className="mt-1 font-display text-h2 font-semibold">
              {counts[status] ?? 0}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionTitle
            title="Assigned to you"
            to="/app/tasks"
            linkLabel="View all"
          />
          {data.myTasks?.length ? (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
              {data.myTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    to={`/app/tasks/${task.id}`}
                    className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="mt-0.5 truncate text-caption text-muted-foreground">
                        {task.project?.name}
                        {task.dueDate
                          ? ` · Due ${formatRelativeTime(task.dueDate)}`
                          : ''}
                      </p>
                    </div>
                    <Badge
                      tone={
                        isOverdue(task.dueDate) && task.status !== 'DONE'
                          ? 'error'
                          : TASK_STATUS_TONE[task.status]
                      }
                    >
                      {TASK_STATUS_LABELS[task.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nothing assigned to you"
              description="Open a project and assign a task, or create the first one."
              action={
                <Link
                  to="/app/projects"
                  className="inline-flex h-8 cursor-pointer items-center rounded-lg bg-secondary px-3 text-caption font-medium text-secondary-foreground hover:bg-secondary-hover"
                >
                  Go to projects
                </Link>
              }
            />
          )}
        </section>

        <section className="lg:col-span-2">
          <SectionTitle
            title="Recent projects"
            to="/app/projects"
            linkLabel="All projects"
          />
          {data.recentProjects?.length ? (
            <ul className="mt-3 space-y-2">
              {data.recentProjects.map((project) => (
                <li key={project.id}>
                  <Link
                    to={`/app/projects/${project.id}`}
                    className="block rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-muted"
                  >
                    <p className="font-medium">{project.name}</p>
                    <p className="mt-0.5 text-caption text-muted-foreground">
                      {project._count?.tasks ?? 0} tasks
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No projects yet"
              description="Create a project to start tracking work."
              action={
                <Link
                  to="/app/projects"
                  className="inline-flex cursor-pointer items-center gap-1.5 text-body-sm font-medium text-primary hover:underline"
                >
                  <Plus className="size-4" />
                  New project
                </Link>
              }
            />
          )}
        </section>
      </div>

      <section className="mt-8">
        <SectionTitle title="Recent activity" to="/app/activity" linkLabel="Full feed" />
        {data.recentActivity?.length ? (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
            {data.recentActivity.map((event) => (
              <li key={event.id}>
                <Link
                  to={activityHref(event)}
                  className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                >
                  <p className="text-body-sm">{activitySentence(event)}</p>
                  <span className="shrink-0 text-caption text-muted-foreground">
                    {formatRelativeTime(event.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-body-sm text-muted-foreground">
            Team activity will show up here as people create projects and tasks.
          </p>
        )}
      </section>
    </div>
  )
}

function SectionTitle({ title, to, linkLabel }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-display text-h4 font-semibold">{title}</h2>
      <Link
        to={to}
        className="text-caption font-medium text-primary hover:underline"
      >
        {linkLabel}
      </Link>
    </div>
  )
}
