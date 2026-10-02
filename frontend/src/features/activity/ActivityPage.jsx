import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { activityHref, activitySentence } from '../../shared/lib/activity'
import { formatRelativeTime } from '../../shared/lib/format'
import { EmptyState, PageHeader, QueryError, Skeleton } from '../../shared/ui/PageState'

export function ActivityPage() {
  const { activeWorkspace } = useWorkspace()

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.activity('workspace', activeWorkspace.id),
    queryFn: () =>
      api.get(`/workspaces/${activeWorkspace.id}/activity?pageSize=50`),
  })

  if (isPending) return <Skeleton className="h-64" />
  if (isError) return <QueryError error={error} onRetry={refetch} />

  const events = data.activity ?? []

  return (
    <div>
      <PageHeader
        title="Activity"
        description="What happened in this workspace while you were away."
      />
      {events.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No activity yet"
            description="Create a project or task and the feed will start filling in."
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                to={activityHref(event)}
                className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
              >
                <p className="text-body-sm">{activitySentence(event)}</p>
                <span className="shrink-0 text-caption text-muted-foreground">
                  {formatRelativeTime(event.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
