import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { formatRelativeTime } from '../../shared/lib/format'
import { Button } from '../../shared/ui/Button'
import { notify } from '../../shared/ui/notify'
import { EmptyState, PageHeader, QueryError, Skeleton } from '../../shared/ui/PageState'

function notificationHref(item) {
  if (item.resourceType === 'task' && item.resourceId) {
    return `/app/tasks/${item.resourceId}`
  }
  if (item.resourceType === 'project' && item.resourceId) {
    return `/app/projects/${item.resourceId}`
  }
  return '/app'
}

export function NotificationsPage() {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace.id
  const queryClient = useQueryClient()

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.notifications(workspaceId),
    queryFn: () =>
      api.get(`/workspaces/${workspaceId}/notifications?pageSize=50`),
  })

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.notifications(workspaceId) }),
  })

  const markAll = useMutation({
    mutationFn: () =>
      api.post(`/workspaces/${workspaceId}/notifications/read-all`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.notifications(workspaceId) })
      notify.success('All caught up.')
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })

  if (isPending) return <Skeleton className="h-64" />
  if (isError) return <QueryError error={error} onRetry={refetch} />

  const items = data.notifications ?? []
  const unreadCount = data.unreadCount ?? 0

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Things that need your eyes — assignments and comments."
        actions={
          unreadCount > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </Button>
          ) : null
        }
      />

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="You are all caught up"
            description="When someone assigns you a task or comments on your work, it lands here."
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={notificationHref(item)}
                onClick={() => {
                  if (!item.readAt) markRead.mutate(item.id)
                }}
                className={`block px-4 py-3 hover:bg-surface-muted ${
                  item.readAt ? '' : 'bg-primary/5'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{item.title}</p>
                  <span className="shrink-0 text-caption text-muted-foreground">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>
                {item.body ? (
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    {item.body}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
