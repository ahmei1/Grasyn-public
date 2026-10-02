import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { activitySentence } from '../../shared/lib/activity'
import { formatRelativeTime, toDateInput } from '../../shared/lib/format'
import {
  canEditTaskExecution,
  canEditTaskPlanning,
} from '../../shared/lib/permissions'
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from '../../shared/lib/labels'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Select } from '../../shared/ui/Select'
import { notify } from '../../shared/ui/notify'
import { QueryError, Skeleton } from '../../shared/ui/PageState'

export function TaskDetailPage() {
  const { taskId } = useParams()
  const { activeWorkspace } = useWorkspace()

  const taskQuery = useQuery({
    queryKey: keys.task(taskId),
    queryFn: () => api.get(`/tasks/${taskId}`),
  })
  const commentsQuery = useQuery({
    queryKey: keys.comments(taskId),
    queryFn: () => api.get(`/tasks/${taskId}/comments`),
  })
  const activityQuery = useQuery({
    queryKey: keys.activity('task', taskId),
    queryFn: () => api.get(`/tasks/${taskId}/activity`),
  })
  const membersQuery = useQuery({
    queryKey: keys.members(activeWorkspace.id),
    queryFn: () => api.get(`/workspaces/${activeWorkspace.id}/members`),
  })

  const task = taskQuery.data?.task

  if (taskQuery.isPending) return <Skeleton className="h-80" />
  if (taskQuery.isError) {
    return <QueryError title="Task not found" error={taskQuery.error} />
  }

  return (
    <TaskEditor
      task={task}
      comments={commentsQuery.data?.comments ?? []}
      commentsLoading={commentsQuery.isPending}
      activity={activityQuery.data?.activity ?? []}
      members={membersQuery.data?.members ?? []}
    />
  )
}

function TaskEditor({ task, comments, commentsLoading, activity, members }) {
  const { taskId } = useParams()
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  const canPlan = canEditTaskPlanning(activeWorkspace.role)
  const canExecute = canEditTaskExecution(
    activeWorkspace.role,
    user?.id,
    task,
  )
  const [form, setForm] = useState(() => ({
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId ?? '',
    dueDate: toDateInput(task.dueDate),
  }))

  const saveTask = useMutation({
    mutationFn: (body) => api.patch(`/tasks/${taskId}`, body),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.task(taskId), data)
      queryClient.invalidateQueries({ queryKey: keys.projectTasks(data.task.projectId) })
      queryClient.invalidateQueries({ queryKey: keys.dashboard(activeWorkspace.id) })
      queryClient.invalidateQueries({ queryKey: keys.activity('task', taskId) })
      queryClient.invalidateQueries({
        queryKey: ['workspace-tasks', activeWorkspace.id],
      })
      queryClient.invalidateQueries({
        queryKey: keys.notifications(activeWorkspace.id),
      })
      notify.success('Task saved.')
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })

  const addComment = useMutation({
    mutationFn: (body) => api.post(`/tasks/${taskId}/comments`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.comments(taskId) })
      queryClient.invalidateQueries({ queryKey: keys.activity('task', taskId) })
      queryClient.invalidateQueries({
        queryKey: keys.notifications(activeWorkspace.id),
      })
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })

  function handleSave(event) {
    event.preventDefault()
    if (!canExecute) return

    const executionFields = {
      description: form.description,
      status: form.status,
    }
    saveTask.mutate(
      canPlan
        ? {
            ...executionFields,
            title: form.title.trim(),
            priority: form.priority,
            assigneeId: form.assigneeId || null,
            dueDate: form.dueDate || null,
          }
        : executionFields,
    )
  }

  return (
    <div>
      <Link
        to={`/app/projects/${task.projectId}`}
        className="inline-flex items-center gap-1.5 text-body-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {task.project?.name ?? 'Project'}
      </Link>

      {!canExecute ? (
        <div
          role="note"
          className="mt-4 rounded-xl border border-border bg-surface-muted p-4 text-body-sm text-muted-foreground"
        >
          This task is assigned to {task.assignee?.name ?? 'no one'}. Members
          can edit only tasks assigned to them.
        </div>
      ) : !canPlan ? (
        <div
          role="note"
          className="mt-4 rounded-xl border border-border bg-surface-muted p-4 text-body-sm text-muted-foreground"
        >
          You can update the status and description. An Admin or Owner controls
          the title, priority, assignee, and due date.
        </div>
      ) : null}

      <form onSubmit={handleSave} className="mt-4 space-y-4">
        <Input
          label="Title"
          value={form.title}
          disabled={!canPlan}
          hint={!canPlan ? 'Only an Admin or Owner can change the title.' : undefined}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-description" className="text-body-sm font-medium">
            Description
          </label>
          <textarea
            id="task-description"
            rows={5}
            value={form.description}
            disabled={!canExecute}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            className="w-full rounded-lg border border-border bg-surface p-3 text-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Status"
            value={form.status}
            disabled={!canExecute}
            onChange={(event) =>
              setForm((current) => ({ ...current, status: event.target.value }))
            }
          >
            {TASK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {TASK_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select
            label="Priority"
            value={form.priority}
            disabled={!canPlan}
            hint={!canPlan ? 'Only an Admin or Owner can change priority.' : undefined}
            onChange={(event) =>
              setForm((current) => ({ ...current, priority: event.target.value }))
            }
          >
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {TASK_PRIORITY_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select
            label="Assignee"
            value={form.assigneeId}
            disabled={!canPlan}
            hint={!canPlan ? 'Only an Admin or Owner can reassign work.' : undefined}
            onChange={(event) =>
              setForm((current) => ({ ...current, assigneeId: event.target.value }))
            }
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.name}
              </option>
            ))}
          </Select>
          <Input
            label="Due date"
            type="date"
            value={form.dueDate}
            disabled={!canPlan}
            hint={!canPlan ? 'Only an Admin or Owner can change the due date.' : undefined}
            onChange={(event) =>
              setForm((current) => ({ ...current, dueDate: event.target.value }))
            }
          />
        </div>
        {canExecute ? (
          <Button type="submit" size="sm" loading={saveTask.isPending}>
            Save changes
          </Button>
        ) : null}
      </form>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <CommentThread
          comments={comments}
          loading={commentsLoading}
          onSubmit={(body) => addComment.mutateAsync(body)}
          pending={addComment.isPending}
        />
        <section>
          <h2 className="font-display text-h4 font-semibold">History</h2>
          {activity.length ? (
            <ul className="mt-3 space-y-3">
              {activity.map((event) => (
                <li key={event.id} className="text-body-sm">
                  <p>{activitySentence(event)}</p>
                  <p className="text-caption text-muted-foreground">
                    {formatRelativeTime(event.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-body-sm text-muted-foreground">
              Updates to this task will appear here.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function CommentThread({ comments, loading, onSubmit, pending }) {
  const [body, setBody] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!body.trim()) return
    await onSubmit(body.trim())
    setBody('')
  }

  return (
    <section>
      <h2 className="font-display text-h4 font-semibold">Comments</h2>
      {loading ? (
        <Skeleton className="mt-3 h-24" />
      ) : comments.length === 0 ? (
        <p className="mt-3 text-body-sm text-muted-foreground">
          No comments yet. Start the thread.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-xl border border-border bg-surface p-3"
            >
              <p className="text-caption font-medium">
                {comment.author?.name}
                <span className="ml-2 font-normal text-muted-foreground">
                  {formatRelativeTime(comment.createdAt)}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-body-sm">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
        <label htmlFor="new-comment" className="text-body-sm font-medium">
          Add a comment
        </label>
        <textarea
          id="new-comment"
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="w-full rounded-lg border border-border bg-surface p-3 text-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        />
        <Button type="submit" size="sm" loading={pending} disabled={!body.trim()}>
          Post comment
        </Button>
      </form>
    </section>
  )
}
