import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { toQuery } from '../../shared/api/query'
import { formatDate, isOverdue } from '../../shared/lib/format'
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_TONE,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
} from '../../shared/lib/labels'
import { Badge } from '../../shared/ui/Badge'
import { Select } from '../../shared/ui/Select'
import {
  EmptyState,
  PageHeader,
  QueryError,
  Skeleton,
} from '../../shared/ui/PageState'

export function MyTasksPage() {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const priority = params.get('priority') ?? ''
  const filters = { assignee: 'me', status, priority }

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.workspaceTasks(activeWorkspace.id, filters),
    queryFn: () =>
      api.get(
        `/workspaces/${activeWorkspace.id}/tasks${toQuery({
          assignee: 'me',
          status: status || undefined,
          priority: priority || undefined,
          pageSize: 50,
        })}`,
      ),
  })

  function updateFilter(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  if (isPending) return <Skeleton className="h-64" />
  if (isError) return <QueryError error={error} onRetry={refetch} />

  const tasks = data.tasks ?? []

  return (
    <div>
      <PageHeader
        title="My tasks"
        description={`Work assigned to ${user?.name?.split(' ')[0] ?? 'you'}.`}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:max-w-md">
        <Select
          label="Status"
          value={status}
          onChange={(event) => updateFilter('status', event.target.value)}
        >
          <option value="">All statuses</option>
          {TASK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {TASK_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select
          label="Priority"
          value={priority}
          onChange={(event) => updateFilter('priority', event.target.value)}
        >
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {TASK_PRIORITY_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      {tasks.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No tasks match these filters"
            description="Clear a filter or pick up a task from a project board."
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                to={`/app/tasks/${task.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{task.title}</p>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {task.project?.name}
                    {task.dueDate ? ` · ${formatDate(task.dueDate)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={TASK_PRIORITY_TONE[task.priority]}>
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </Badge>
                  <Badge
                    tone={
                      isOverdue(task.dueDate) && task.status !== 'DONE'
                        ? 'error'
                        : TASK_STATUS_TONE[task.status]
                    }
                  >
                    {TASK_STATUS_LABELS[task.status]}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
