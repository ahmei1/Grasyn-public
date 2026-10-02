import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Columns3, Plus } from 'lucide-react'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { formatDate, isOverdue } from '../../shared/lib/format'
import {
  PROJECT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
} from '../../shared/lib/labels'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { notify } from '../../shared/ui/notify'
import {
  EmptyState,
  PageHeader,
  QueryError,
  Skeleton,
} from '../../shared/ui/PageState'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [adding, setAdding] = useState(false)

  const projectQuery = useQuery({
    queryKey: keys.project(projectId),
    queryFn: () => api.get(`/projects/${projectId}`),
  })
  const tasksQuery = useQuery({
    queryKey: keys.projectTasks(projectId),
    queryFn: () => api.get(`/projects/${projectId}/tasks?pageSize=100`),
  })

  const createTask = useMutation({
    mutationFn: (body) => api.post(`/projects/${projectId}/tasks`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.projectTasks(projectId) })
      queryClient.invalidateQueries({ queryKey: keys.project(projectId) })
      queryClient.invalidateQueries({
        queryKey: keys.dashboard(activeWorkspace.id),
      })
      setTitle('')
      setDescription('')
      setAdding(false)
      notify.success('Task created.')
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })

  if (projectQuery.isPending) {
    return <Skeleton className="h-64" />
  }

  if (projectQuery.isError) {
    return (
      <QueryError
        title="Project not found"
        error={projectQuery.error}
      />
    )
  }

  const project = projectQuery.data.project
  const tasks = tasksQuery.data?.tasks ?? []

  return (
    <div>
      <PageHeader
        title={project.name}
        description={project.description || 'No description yet.'}
        actions={
          <>
            <Link
              to={`/app/projects/${projectId}/board`}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-caption font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <Columns3 className="size-4" />
              Board
            </Link>
            <Button size="sm" onClick={() => setAdding((open) => !open)}>
              <Plus className="size-4" />
              New task
            </Button>
          </>
        }
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="muted">
          {PROJECT_STATUS_LABELS[project.status] ?? project.status}
        </Badge>
        <span className="text-caption text-muted-foreground">
          {project._count?.tasks ?? tasks.length} tasks
        </span>
      </div>

      {adding ? (
        <form
          className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!title.trim()) return
            createTask.mutate({
              title: title.trim(),
              description: description.trim() || undefined,
            })
          }}
        >
          <Input
            label="Task title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Write the first draft"
            autoFocus
          />
          <Input
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional details"
          />
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" loading={createTask.isPending}>
              Add task
            </Button>
          </div>
        </form>
      ) : null}

      {tasksQuery.isPending ? (
        <Skeleton className="mt-6 h-48" />
      ) : tasks.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No tasks in this project"
            description="Add a task to get this project moving."
            action={
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-4" />
                New task
              </Button>
            }
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
                    {task.assignee?.name ?? 'Unassigned'}
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
