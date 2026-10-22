import { formatDate } from './format'
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from './labels'

const statusLabel = (value) => TASK_STATUS_LABELS[value] ?? value
const priorityLabel = (value) => TASK_PRIORITY_LABELS[value] ?? value

function joinPhrases(phrases) {
  if (phrases.length <= 1) return phrases.join('')
  return `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`
}

function describeChange(field, meta) {
  switch (field) {
    case 'title':
      return `renamed it to "${meta.title}"`
    case 'description':
      return 'updated the description'
    case 'status':
      return meta.previousStatus
        ? `moved it from ${statusLabel(meta.previousStatus)} to ${statusLabel(meta.status)}`
        : `moved it to ${statusLabel(meta.status)}`
    case 'priority':
      return meta.priority
        ? `changed the priority to ${priorityLabel(meta.priority)}`
        : 'changed the priority'
    case 'assignee':
      if (!meta.assigneeId) return 'removed the assignee'
      return `assigned it to ${meta.assigneeName ?? 'a teammate'}`
    case 'dueDate':
      if (!meta.dueDate) return 'removed the due date'
      return meta.previousDueDate
        ? `changed the due date from ${formatDate(meta.previousDueDate)} to ${formatDate(meta.dueDate)}`
        : `set the due date to ${formatDate(meta.dueDate)}`
    default:
      return null
  }
}

function taskChangeSentence(actor, task, meta) {
  const phrases = (meta.changes ?? [])
    .map((field) => describeChange(field, meta))
    .filter(Boolean)
  if (phrases.length === 0) return `${actor} updated ${task}`
  return `${actor} updated ${task}: ${joinPhrases(phrases)}`
}

/**
 * Turns one activity row from the API into a short English sentence.
 * Keep this out of the pages so every feed says the same thing.
 */
export function activitySentence(event) {
  const meta = event.metadata ?? {}
  // GitHub events have no Grasyn actor, only the GitHub login.
  const actor = event.actor?.name ?? meta.githubLogin ?? 'Someone'
  const task = event.task?.title ?? meta.title ?? meta.taskTitle ?? 'a task'
  const project = event.project?.name ?? meta.name ?? 'a project'
  const pull = `PR #${meta.number}`

  switch (event.type) {
    case 'code.pushed':
      return `${actor} pushed ${meta.count === 1 ? 'a commit' : `${meta.count} commits`} for ${task} to ${meta.branch}`
    case 'code.pr_opened':
      return `${actor} opened ${pull} for ${task}`
    case 'code.pr_reopened':
      return `${actor} reopened ${pull} for ${task}`
    case 'code.pr_linked':
      return `${actor} linked ${pull} to ${task}`
    case 'code.pr_merged':
      return `${actor} merged ${pull} for ${task}`
    case 'code.pr_closed':
      return `${actor} closed ${pull} for ${task} without merging`
    case 'code.pr_reviewed':
      return meta.review === 'APPROVED'
        ? `${actor} approved ${pull} for ${task}`
        : `${actor} asked for changes on ${pull} for ${task}`
    case 'github.connected':
      return `${actor} connected GitHub (${meta.account})`
    case 'github.disconnected':
      return meta.uninstalled
        ? `${actor} uninstalled the GitHub app from ${meta.account}`
        : `${actor} disconnected GitHub (${meta.account})`
    case 'task.created':
      return `${actor} created ${task}`
    case 'task.updated':
    case 'task.status_changed':
    case 'task.reassigned':
      return taskChangeSentence(actor, task, meta)
    case 'task.moved':
      if (meta.previousStatus && meta.status) {
        return `${actor} moved ${task} from ${statusLabel(meta.previousStatus)} to ${statusLabel(meta.status)}`
      }
      return meta.status
        ? `${actor} moved ${task} to ${statusLabel(meta.status)}`
        : `${actor} moved ${task}`
    case 'comment.created':
      return `${actor} commented on ${task}`
    case 'project.created':
      return `${actor} created ${project}`
    case 'project.updated':
      return `${actor} updated ${project}`
    case 'project.archived':
      return `${actor} archived ${project}`
    case 'meeting.created':
      return `${actor} scheduled the meeting "${meta.title}"`
    case 'meeting.updated':
      return `${actor} updated the meeting "${meta.title}"`
    case 'meeting.deleted':
      return `${actor} cancelled the meeting "${meta.title}"`
    case 'meeting.action_converted':
      return `${actor} turned "${meta.title}" from ${meta.meetingTitle ? `"${meta.meetingTitle}"` : 'a meeting'} into a task`
    default:
      return `${actor} updated the workspace`
  }
}

export function activityHref(event) {
  if (event.taskId) return `/app/tasks/${event.taskId}`
  if (event.type?.startsWith('github.')) return '/app/settings/workspace'
  if (event.metadata?.meetingId && event.type !== 'meeting.deleted') {
    return `/app/meetings/${event.metadata.meetingId}`
  }
  if (event.projectId) return `/app/projects/${event.projectId}`
  return '/app'
}
