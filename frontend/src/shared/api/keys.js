/** Query keys so every screen talks about the same cache entries. */
export const keys = {
  dashboard: (workspaceId) => ['dashboard', workspaceId],
  projects: (workspaceId) => ['projects', workspaceId],
  project: (projectId) => ['project', projectId],
  projectTasks: (projectId) => ['project-tasks', projectId],
  workspaceTasks: (workspaceId, filters) => [
    'workspace-tasks',
    workspaceId,
    filters,
  ],
  task: (taskId) => ['task', taskId],
  comments: (taskId) => ['comments', taskId],
  activity: (scope, id) => ['activity', scope, id],
  /** Prefix for invalidating both the list and the unread summary. */
  notifications: (workspaceId) => ['notifications', workspaceId],
  notificationList: (workspaceId) => ['notifications', workspaceId, 'list'],
  notificationSummary: (workspaceId) => [
    'notifications',
    workspaceId,
    'summary',
  ],
  members: (workspaceId) => ['members', workspaceId],
  messages: (projectId) => ['messages', projectId],
  meetings: (projectId) => ['meetings', projectId],
  meeting: (meetingId) => ['meeting', meetingId],
  github: (workspaceId) => ['github', workspaceId],
  taskCode: (taskId) => ['code', 'task', taskId],
  projectCode: (projectId) => ['code', 'project', projectId],
}
