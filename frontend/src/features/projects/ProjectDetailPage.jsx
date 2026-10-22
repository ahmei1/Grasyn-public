import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Columns3, Pencil, Plus, Trash2 } from 'lucide-react'
import { ProjectDiscussion } from './ProjectDiscussion'
import { ProjectMeetings } from '../meetings/ProjectMeetings'
import { ProjectCode } from '../code/CodeActivity'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { formatDate, isOverdue } from '../../shared/lib/format'
import { canManageProject } from '../../shared/lib/permissions'
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
import { Select } from '../../shared/ui/Select'
import { notify } from '../../shared/ui/notify'
import { TaskKey } from '../../shared/ui/TaskKey'
import { ViewingNow } from '../../shared/realtime/PresenceAvatars'
import {
  EmptyState,
  PageHeader,
  QueryError,
  Skeleton,
} from '../../shared/ui/PageState'

const TABS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'discussion', label: 'Discussion' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'code', label: 'Code' },
]

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.some((item) => item.id === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'tasks'
  const selectTab = (next) =>
    setSearchParams(next === 'tasks' ? {} : { tab: next }, { replace: true })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(null)

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
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      queryClient.invalidateQueries({
        queryKey: ['workspace-tasks', activeWorkspace.id],
      })
      setTitle('')
      setDescription('')
      setAdding(false)
      notify.success('Task created.')
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })
  const updateProject = useMutation({
    mutationFn: (body) => api.patch(`/projects/${projectId}`, body),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.project(projectId), data)
      queryClient.invalidateQueries({
        queryKey: keys.projects(activeWorkspace.id),
      })
      queryClient.invalidateQueries({
        queryKey: keys.dashboard(activeWorkspace.id),
      })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      setEditing(false)
      notify.success('Project updated.')
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })
  const deleteProject = useMutation({
    mutationFn: () => api.del(`/projects/${projectId}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.project(projectId) })
      queryClient.invalidateQueries({
        queryKey: keys.projects(activeWorkspace.id),
      })
      queryClient.invalidateQueries({
        queryKey: keys.dashboard(activeWorkspace.id),
      })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      queryClient.invalidateQueries({
        queryKey: ['workspace-tasks', activeWorkspace.id],
      })
      notify.success('Project deleted.')
      navigate('/app/projects')
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
  const canManage = canManageProject(activeWorkspace.role, user.id, project)

  function beginEditing() {
    setEditForm({
      name: project.name,
      description: project.description ?? '',
      status: project.status,
      priority: project.priority,
      startDate: project.startDate?.slice(0, 10) ?? '',
      dueDate: project.dueDate?.slice(0, 10) ?? '',
    })
    setEditing(true)
  }

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${project.name}" and all of its tasks? This cannot be undone.`,
    )
    if (confirmed) deleteProject.mutate()
  }

  return (
    <div>
      <ViewingNow projectId={projectId} className="mb-4" />
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
            {canManage ? (
              <>
                <Button size="sm" variant="outline" onClick={beginEditing}>
                  <Pencil className="size-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={deleteProject.isPending}
                  onClick={handleDelete}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              onClick={() => {
                selectTab('tasks')
                setAdding((open) => tab !== 'tasks' || !open)
              }}
            >
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

      {editing && editForm ? (
        <form
          className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!editForm.name.trim()) return
            updateProject.mutate({
              ...editForm,
              name: editForm.name.trim(),
              description: editForm.description.trim(),
              startDate: editForm.startDate || null,
              dueDate: editForm.dueDate || null,
            })
          }}
        >
          <Input
            label="Project name"
            value={editForm.name}
            onChange={(event) =>
              setEditForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            autoFocus
          />
          <Input
            label="Description"
            value={editForm.description}
            onChange={(event) =>
              setEditForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
          <Select
            label="Status"
            value={editForm.status}
            onChange={(event) =>
              setEditForm((current) => ({
                ...current,
                status: event.target.value,
              }))
            }
          >
            <option value="ACTIVE">Active</option>
            <option value="ON_HOLD">On hold</option>
            <option value="COMPLETED">Completed</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          <Select
            label="Priority"
            value={editForm.priority}
            onChange={(event) =>
              setEditForm((current) => ({
                ...current,
                priority: event.target.value,
              }))
            }
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </Select>
          <Input
            label="Start date"
            type="date"
            value={editForm.startDate}
            onChange={(event) =>
              setEditForm((current) => ({
                ...current,
                startDate: event.target.value,
              }))
            }
          />
          <Input
            label="Due date"
            type="date"
            value={editForm.dueDate}
            onChange={(event) =>
              setEditForm((current) => ({
                ...current,
                dueDate: event.target.value,
              }))
            }
          />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" loading={updateProject.isPending}>
              Save changes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div
        role="tablist"
        aria-label="Project sections"
        className="mt-6 flex gap-1 border-b border-border"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`project-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`project-panel-${item.id}`}
            onClick={() => selectTab(item.id)}
            className={clsx(
              '-mb-px cursor-pointer border-b-2 px-3 py-2 text-body-sm font-medium transition',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
              tab === item.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`project-panel-${tab}`}
        aria-labelledby={`project-tab-${tab}`}
        className="mt-6"
      >
        {tab === 'discussion' ? (
          <ProjectDiscussion projectId={projectId} />
        ) : tab === 'meetings' ? (
          <ProjectMeetings projectId={projectId} />
        ) : tab === 'code' ? (
          <ProjectCode projectId={projectId} />
        ) : (
          <TasksPanel
            adding={adding}
            title={title}
            description={description}
            setTitle={setTitle}
            setDescription={setDescription}
            setAdding={setAdding}
            createTask={createTask}
            tasksQuery={tasksQuery}
            tasks={tasks}
          />
        )}
      </div>
    </div>
  )
}

function TasksPanel({
  adding,
  title,
  description,
  setTitle,
  setDescription,
  setAdding,
  createTask,
  tasksQuery,
  tasks,
}) {
  return (
    <>
      {adding ? (
        <form
          className="mb-6 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
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
        <Skeleton className="h-48" />
      ) : tasks.length === 0 ? (
        <div>
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
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                to={`/app/tasks/${task.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <p className="flex min-w-0 items-baseline gap-2">
                    <TaskKey task={task} />
                    <span className="truncate font-medium">{task.title}</span>
                  </p>
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
    </>
  )
}
