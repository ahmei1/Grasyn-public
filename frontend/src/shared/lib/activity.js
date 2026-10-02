import { TASK_STATUS_LABELS } from './labels'

/**
 * Turns one activity row from the API into a short English sentence.
 * Keep this out of the pages so every feed says the same thing.
 */
export function activitySentence(event) {
  const actor = event.actor?.name ?? 'Someone'
  const task = event.task?.title
  const project = event.project?.name
  const status = event.metadata?.status
    ? TASK_STATUS_LABELS[event.metadata.status] ?? event.metadata.status
    : null

  switch (event.type) {
    case 'task.created':
      return `${actor} created ${task ?? 'a task'}`
    case 'task.updated':
      return status
        ? `${actor} moved ${task ?? 'a task'} to ${status}`
        : `${actor} updated ${task ?? 'a task'}`
    case 'task.moved':
      return `${actor} moved ${task ?? 'a task'}${status ? ` to ${status}` : ''}`
    case 'comment.created':
      return `${actor} commented on ${task ?? event.metadata?.taskTitle ?? 'a task'}`
    case 'project.created':
      return `${actor} created ${project ?? event.metadata?.name ?? 'a project'}`
    case 'project.updated':
      return `${actor} updated ${project ?? 'a project'}`
    case 'project.archived':
      return `${actor} archived ${project ?? 'a project'}`
    default:
      return `${actor} updated the workspace`
  }
}

export function activityHref(event) {
  if (event.taskId) return `/app/tasks/${event.taskId}`
  if (event.projectId) return `/app/projects/${event.projectId}`
  return '/app'
}
