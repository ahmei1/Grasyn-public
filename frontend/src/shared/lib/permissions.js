export function isWorkspaceManager(role) {
  return role === 'OWNER' || role === 'ADMIN'
}

export function canEditTaskPlanning(role) {
  return isWorkspaceManager(role)
}

export function canEditTaskExecution(role, userId, task) {
  return isWorkspaceManager(role) || task.assigneeId === userId
}

export function canMoveTask(role, userId, task) {
  return canEditTaskExecution(role, userId, task)
}

export function canManageProject(role, userId, project) {
  return isWorkspaceManager(role) || project.ownerId === userId
}

/** Organizer, project creator, or a workspace admin. Matches the API. */
export function canOrganizeMeeting(role, userId, meeting) {
  return (
    isWorkspaceManager(role) ||
    meeting.createdById === userId ||
    meeting.project?.ownerId === userId
  )
}

export function canEditMeeting(role, userId, meeting) {
  return (
    canOrganizeMeeting(role, userId, meeting) ||
    (meeting.participants ?? []).some((seat) => seat.userId === userId)
  )
}

export function canManageMember(actorRole, targetRole) {
  if (targetRole === 'OWNER') return false
  if (actorRole === 'OWNER') return true
  return actorRole === 'ADMIN' && targetRole === 'MEMBER'
}

export function canAssignAdmin(role) {
  return role === 'OWNER'
}
