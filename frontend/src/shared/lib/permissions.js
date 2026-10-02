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

export function canManageMember(actorRole, targetRole) {
  if (targetRole === 'OWNER') return false
  if (actorRole === 'OWNER') return true
  return actorRole === 'ADMIN' && targetRole === 'MEMBER'
}

export function canAssignAdmin(role) {
  return role === 'OWNER'
}
