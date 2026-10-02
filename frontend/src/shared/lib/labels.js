export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']

export const TASK_STATUS_LABELS = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
}

export const TASK_STATUS_TONE = {
  TODO: 'muted',
  IN_PROGRESS: 'primary',
  IN_REVIEW: 'warning',
  DONE: 'success',
}

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

export const TASK_PRIORITY_LABELS = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

export const TASK_PRIORITY_TONE = {
  LOW: 'muted',
  MEDIUM: 'primary',
  HIGH: 'warning',
  URGENT: 'error',
}

export const PROJECT_STATUS_LABELS = {
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
}

export const ROLE_LABELS = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
}

export function canManageMembers(role) {
  return role === 'OWNER' || role === 'ADMIN'
}
