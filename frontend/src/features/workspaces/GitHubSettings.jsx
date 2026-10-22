import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useWorkspace } from './WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { formatRelativeTime } from '../../shared/lib/format'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Select } from '../../shared/ui/Select'
import { notify } from '../../shared/ui/notify'
import { QueryError, Skeleton } from '../../shared/ui/PageState'

const GITHUB_RESULTS = {
  connected: {
    ok: true,
    message: 'GitHub is connected. Assign each repository to a project below.',
  },
  updated: {
    ok: true,
    message: 'Repository list updated from GitHub.',
  },
  expired: {
    ok: false,
    message: 'That GitHub link expired. Click Connect GitHub and try again.',
  },
  forbidden: {
    ok: false,
    message: 'You no longer have permission to connect GitHub.',
  },
  taken: {
    ok: false,
    message:
      'That GitHub account is already connected to another workspace.',
  },
  already: {
    ok: false,
    message:
      'This workspace is already connected to a different GitHub account.',
  },
  missing: {
    ok: false,
    message:
      'GitHub sent us back without an installation. Try connecting again.',
  },
  github: {
    ok: false,
    message: 'GitHub could not be reached. Try again in a moment.',
  },
  disabled: {
    ok: false,
    message: 'GitHub is not set up on this server.',
  },
}

export function GitHubSettings({ canManage }) {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace.id
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const announced = useRef(false)

  const githubQuery = useQuery({
    queryKey: keys.github(workspaceId),
    queryFn: () => api.get(`/workspaces/${workspaceId}/github`),
  })
  const projectsQuery = useQuery({
    queryKey: keys.projects(workspaceId),
    queryFn: () => api.get(`/workspaces/${workspaceId}/projects?pageSize=50`),
    enabled: canManage,
  })

  useEffect(() => {
    const result = searchParams.get('github')
    if (!result || announced.current) return
    announced.current = true
    const notice = GITHUB_RESULTS[result]
    if (notice) {
      if (notice.ok) notify.success(notice.message)
      else notify.error(notice.message)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('github')
    setSearchParams(next, { replace: true })
    queryClient.invalidateQueries({ queryKey: keys.github(workspaceId) })
  }, [searchParams, setSearchParams, queryClient, workspaceId])

  const connect = useMutation({
    mutationFn: () => api.post(`/workspaces/${workspaceId}/github/connect`),
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
    onError: (error) => notify.apiError(error),
  })

  const disconnect = useMutation({
    mutationFn: () => api.del(`/workspaces/${workspaceId}/github`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.github(workspaceId) })
      queryClient.invalidateQueries({ queryKey: ['code'] })
      notify.success(
        'GitHub disconnected. The app is still installed on GitHub.',
      )
    },
    onError: (error) => notify.apiError(error),
  })

  const mapRepo = useMutation({
    mutationFn: ({ repositoryId, projectId }) =>
      api.patch(`/github/repositories/${repositoryId}`, { projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.github(workspaceId) })
      queryClient.invalidateQueries({ queryKey: ['code'] })
    },
    onError: (error) => notify.apiError(error),
  })

  return (
    <section className="mt-8 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-display text-h4 font-semibold">GitHub</h2>
      <p className="mt-1 text-body-sm text-muted-foreground">
        Connect the GitHub App so pushes and pull requests that mention a task
        key show up on that task and on the project's Code tab.
      </p>
      {githubQuery.isPending ? (
        <Skeleton className="mt-4 h-24" />
      ) : githubQuery.isError ? (
        <QueryError
          title="Could not load GitHub status"
          error={githubQuery.error}
          onRetry={githubQuery.refetch}
        />
      ) : (
        <GitHubBody
          status={githubQuery.data}
          projects={projectsQuery.data?.projects ?? []}
          canManage={canManage}
          connecting={connect.isPending}
          disconnecting={disconnect.isPending}
          mapping={mapRepo.isPending}
          onConnect={() => connect.mutate()}
          onDisconnect={() => {
            if (
              window.confirm(
                'Disconnect GitHub from this workspace? Code history stored in Grasyn will be removed. The app stays installed on GitHub.',
              )
            ) {
              disconnect.mutate()
            }
          }}
          onMap={(repositoryId, projectId) =>
            mapRepo.mutate({ repositoryId, projectId })
          }
        />
      )}
    </section>
  )
}

function GitHubBody({
  status,
  projects,
  canManage,
  connecting,
  disconnecting,
  mapping,
  onConnect,
  onDisconnect,
  onMap,
}) {
  if (!status.configured) {
    return (
      <p className="mt-4 text-body-sm text-muted-foreground">
        GitHub is not set up on this server yet. The API needs the GitHub App
        settings before anyone can connect.
      </p>
    )
  }

  if (!status.installation) {
    return (
      <div className="mt-4">
        {canManage ? (
          <Button loading={connecting} onClick={onConnect}>
            Connect GitHub
          </Button>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            Not connected. Only an admin or the owner can connect GitHub.
          </p>
        )}
      </div>
    )
  }

  const { installation, repositories } = status

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-body-sm">
            Connected to{' '}
            <span className="font-medium">{installation.accountLogin}</span>
            {installation.accountType === 'Organization' ? (
              <Badge tone="muted" className="ml-2">
                Organization
              </Badge>
            ) : null}
            {installation.suspended ? (
              <Badge tone="warning" className="ml-2">
                Suspended
              </Badge>
            ) : null}
          </p>
          <p className="text-caption text-muted-foreground">
            Connected {formatRelativeTime(installation.connectedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={installation.manageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-body-sm text-primary hover:underline"
          >
            Manage on GitHub
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          {canManage ? (
            <Button
              size="sm"
              variant="ghost"
              loading={disconnecting}
              onClick={onDisconnect}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      </div>

      {repositories.length === 0 ? (
        <p className="mt-4 text-body-sm text-muted-foreground">
          No repositories yet. Open Manage on GitHub and grant access to the
          repos this team uses.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {repositories.map((repository) => (
            <li
              key={repository.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <a
                href={repository.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-body-sm hover:text-primary hover:underline"
              >
                {repository.fullName}
                {repository.private ? (
                  <span className="ml-2 font-sans text-caption text-muted-foreground">
                    Private
                  </span>
                ) : null}
              </a>
              {canManage ? (
                <div className="w-56">
                  <Select
                    aria-label={`Project for ${repository.fullName}`}
                    value={repository.project?.id ?? ''}
                    disabled={mapping}
                    onChange={(event) =>
                      onMap(repository.id, event.target.value || null)
                    }
                  >
                    <option value="">Not assigned</option>
                    {projectOptions(projects, repository.project).map(
                      (project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ),
                    )}
                  </Select>
                </div>
              ) : (
                <p className="text-body-sm text-muted-foreground">
                  {repository.project?.name ?? 'Not assigned'}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function projectOptions(projects, current) {
  if (!current || projects.some((project) => project.id === current.id)) {
    return projects
  }
  return [current, ...projects]
}
