import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { formatRelativeTime } from '../../shared/lib/format'
import { Badge } from '../../shared/ui/Badge'
import { EmptyState, PageHeader, QueryError, Skeleton } from '../../shared/ui/PageState'

function notificationHref(item) {
  if (item.resourceType === 'task' && item.resourceId) {
    return `/app/tasks/${item.resourceId}`
  }
  if (item.type === 'project.message' && item.resourceId) {
    return `/app/projects/${item.resourceId}?tab=discussion`
  }
  if (item.resourceType === 'project' && item.resourceId) {
    return `/app/projects/${item.resourceId}`
  }
  if (item.resourceType === 'meeting' && item.resourceId) {
    return `/app/meetings/${item.resourceId}`
  }
  return '/app'
}

function notificationLabel(type) {
  if (type?.startsWith('meeting.')) return 'Meeting'
  if (type?.startsWith('code.')) return 'Code'
  if (type === 'project.message') return 'Message'
  if (type?.includes('assigned')) return 'Assignment'
  if (type?.includes('comment')) return 'Comment'
  if (type?.includes('created')) return 'New task'
  return 'Update'
}

export function NotificationsPage() {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace.id
  const queryClient = useQueryClient()
  const markedAt = useRef(null)

  const { data, dataUpdatedAt, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.notificationList(workspaceId),
    queryFn: () =>
      api.get(`/workspaces/${workspaceId}/notifications?pageSize=50`),
  })

  const { mutate: markAllRead } = useMutation({
    mutationFn: () =>
      api.post(`/workspaces/${workspaceId}/notifications/read-all`),
    onSuccess: () => {
      // The list keeps its "New" highlights for this visit; only the badge clears.
      queryClient.setQueryData(keys.notificationSummary(workspaceId), (old) =>
        old ? { ...old, unreadCount: 0 } : old,
      )
      queryClient.invalidateQueries({ queryKey: keys.notificationSummary(workspaceId) })
      queryClient.invalidateQueries({ queryKey: keys.dashboard(workspaceId) })
    },
  })

  const unreadCount = data?.unreadCount ?? 0

  useEffect(() => {
    if (unreadCount > 0 && markedAt.current !== dataUpdatedAt) {
      markedAt.current = dataUpdatedAt
      markAllRead()
    }
  }, [unreadCount, dataUpdatedAt, markAllRead])

  if (isPending) return <Skeleton className="h-64" />
  if (isError) return <QueryError error={error} onRetry={refetch} />

  const items = data.notifications ?? []

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} new since your last visit to ${activeWorkspace.name}.`
            : `You are up to date in ${activeWorkspace.name}.`
        }
      />

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="You are all caught up"
            description="When someone assigns you a task, changes your work, or comments on it, it lands here."
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={notificationHref(item)}
                className={`block px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring ${
                  item.readAt ? '' : 'bg-primary/5'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.title}</p>
                      {!item.readAt ? <Badge tone="primary">New</Badge> : null}
                      <Badge tone="muted">{notificationLabel(item.type)}</Badge>
                    </div>
                    {item.body ? (
                      <p className="mt-1 text-body-sm text-muted-foreground">
                        {item.body}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-caption text-muted-foreground">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
