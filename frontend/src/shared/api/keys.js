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
  notifications: (workspaceId) => ['notifications', workspaceId],
  members: (workspaceId) => ['members', workspaceId],
}
