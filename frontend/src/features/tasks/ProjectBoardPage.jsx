import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { formatDate, isOverdue } from '../../shared/lib/format'
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../../shared/lib/labels'
import { canMoveTask } from '../../shared/lib/permissions'
import { Badge } from '../../shared/ui/Badge'
import { QueryError, Skeleton } from '../../shared/ui/PageState'
import { notify } from '../../shared/ui/notify'
import { TaskKey } from '../../shared/ui/TaskKey'
import { ViewingNow } from '../../shared/realtime/PresenceAvatars'

function groupTasks(tasks) {
  const groups = Object.fromEntries(TASK_STATUSES.map((status) => [status, []]))
  for (const task of tasks) {
    if (groups[task.status]) groups[task.status].push(task)
    else groups.TODO.push(task)
  }
  for (const status of TASK_STATUSES) {
    groups[status].sort((a, b) => a.position - b.position)
  }
  return groups
}

function columnId(status) {
  return `column:${status}`
}

function parseOver(overId, grouped) {
  if (typeof overId !== 'string') return null
  if (overId.startsWith('column:')) {
    const status = overId.slice('column:'.length)
    return { status, position: grouped[status]?.length ?? 0 }
  }
  for (const status of TASK_STATUSES) {
    const index = grouped[status].findIndex((task) => task.id === overId)
    if (index >= 0) return { status, position: index }
  }
  return null
}

export function ProjectBoardPage() {
  const { projectId } = useParams()
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState(null)

  const projectQuery = useQuery({
    queryKey: keys.project(projectId),
    queryFn: () => api.get(`/projects/${projectId}`),
  })
  const tasksQuery = useQuery({
    queryKey: keys.projectTasks(projectId),
    queryFn: () => api.get(`/projects/${projectId}/tasks?pageSize=100`),
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const tasks = tasksQuery.data?.tasks
  const grouped = useMemo(() => groupTasks(tasks ?? []), [tasks])
  const activeTask = (tasks ?? []).find((task) => task.id === activeId) ?? null

  const moveTask = useMutation({
    mutationFn: ({ taskId, status, position }) =>
      api.patch(`/tasks/${taskId}/position`, { status, position }),
    onError: (mutationError) => {
      notify.apiError(mutationError)
      queryClient.invalidateQueries({ queryKey: keys.projectTasks(projectId) })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.projectTasks(projectId) })
      queryClient.invalidateQueries({
        queryKey: keys.dashboard(activeWorkspace.id),
      })
      queryClient.invalidateQueries({
        queryKey: ['workspace-tasks', activeWorkspace.id],
      })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })

  function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const task = (tasks ?? []).find((item) => item.id === active.id)
    const destination = parseOver(over.id, grouped)
    if (!task || !destination) return
    if (!canMoveTask(activeWorkspace.role, user?.id, task)) return
    if (task.status === destination.status && task.position === destination.position) {
      return
    }

    const nextTasks = (tasks ?? []).map((item) =>
      item.id === task.id
        ? { ...item, status: destination.status, position: destination.position }
        : item,
    )
    queryClient.setQueryData(keys.projectTasks(projectId), (current) =>
      current ? { ...current, tasks: nextTasks } : current,
    )
    moveTask.mutate({
      taskId: task.id,
      status: destination.status,
      position: destination.position,
    })
  }

  if (projectQuery.isPending || tasksQuery.isPending) {
    return <Skeleton className="h-96" />
  }
  if (projectQuery.isError) {
    return <QueryError title="Board unavailable" error={projectQuery.error} />
  }
  if (tasksQuery.isError) {
    return <QueryError error={tasksQuery.error} onRetry={tasksQuery.refetch} />
  }

  const project = projectQuery.data.project

  return (
    <div>
      <Link
        to={`/app/projects/${projectId}`}
        className="inline-flex items-center gap-1.5 text-body-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {project.name}
      </Link>
      <h1 className="mt-3 font-display text-h2 font-semibold tracking-tight">
        Board
      </h1>
      <p className="mt-1 text-body-sm text-muted-foreground">
        Admins can move any card. Members can move cards assigned to them.
      </p>
      <ViewingNow projectId={projectId} className="mt-3" />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TASK_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={grouped[status]}
              role={activeWorkspace.role}
              userId={user?.id}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function BoardColumn({ status, tasks, role, userId }) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) })
  const itemIds = tasks.map((task) => task.id)

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-72 flex-col rounded-xl border bg-surface-muted/60 p-3 ${
        isOver ? 'border-primary' : 'border-border'
      }`}
    >
      <header className="flex items-center justify-between px-1 pb-3">
        <h2 className="text-body-sm font-semibold">
          {TASK_STATUS_LABELS[status]}
        </h2>
        <span className="text-caption text-muted-foreground">{tasks.length}</span>
      </header>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-1 flex-col gap-2">
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              canMove={canMoveTask(role, userId, task)}
            />
          ))}
          {tasks.length === 0 ? (
            <li className="rounded-lg border border-dashed border-border p-3 text-caption text-muted-foreground">
              No tasks here yet.
            </li>
          ) : null}
        </ul>
      </SortableContext>
    </section>
  )
}

function SortableTaskCard({ task, canMove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: !canMove })

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? 'opacity-40' : undefined}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} canMove={canMove} />
    </li>
  )
}

function TaskCard({ task, overlay = false, canMove = true }) {
  const overdue = task.status !== 'DONE' && isOverdue(task.dueDate)
  const content = (
    <div
      className={`rounded-lg border bg-surface p-3 shadow-xs ${
        overdue ? 'border-error-700/40' : 'border-border'
      } ${overlay ? 'shadow-lg' : ''}`}
    >
      <TaskKey task={task} className="mb-0.5 block" />
      <p className="text-body-sm font-medium">{task.title}</p>
      {task.dueDate && (
        <p
          className={`mt-1.5 flex items-center gap-1 text-caption ${
            overdue ? 'font-medium text-error-700' : 'text-muted-foreground'
          }`}
        >
          <CalendarDays className="size-3.5" aria-hidden />
          {overdue ? 'Overdue · ' : 'Due '}
          {formatDate(task.dueDate)}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-caption text-muted-foreground">
          {task.assignee?.name ?? 'Unassigned'}
        </span>
        <Badge tone="muted">{task.priority}</Badge>
      </div>
    </div>
  )

  if (overlay) return content

  return (
    <Link
      to={`/app/tasks/${task.id}`}
      className={
        canMove
          ? 'block cursor-grab active:cursor-grabbing'
          : 'block cursor-default'
      }
      title={
        canMove
          ? 'Drag to update status'
          : 'Only the assignee or a workspace admin can move this task'
      }
    >
      {content}
    </Link>
  )
}
