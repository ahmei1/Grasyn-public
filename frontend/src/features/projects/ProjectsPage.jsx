import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { PROJECT_STATUS_LABELS } from '../../shared/lib/labels'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { notify } from '../../shared/ui/notify'
import {
  EmptyState,
  PageHeader,
  QueryError,
  Skeleton,
} from '../../shared/ui/PageState'

export function ProjectsPage() {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace.id
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.projects(workspaceId),
    queryFn: () => api.get(`/workspaces/${workspaceId}/projects?pageSize=50`),
  })

  const createProject = useMutation({
    mutationFn: (body) =>
      api.post(`/workspaces/${workspaceId}/projects`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.projects(workspaceId) })
      queryClient.invalidateQueries({ queryKey: keys.dashboard(workspaceId) })
      setName('')
      setDescription('')
      setCreating(false)
      notify.success('Project created.')
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })

  function handleCreate(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    createProject.mutate({
      name: trimmed,
      description: description.trim() || undefined,
    })
  }

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-36" />
        ))}
      </div>
    )
  }

  if (isError) {
    return <QueryError error={error} onRetry={refetch} />
  }

  const projects = data.projects ?? []

  return (
    <div>
      <PageHeader
        title="Projects"
        description="The workstreams in this workspace."
        actions={
          <Button size="sm" onClick={() => setCreating((open) => !open)}>
            <Plus className="size-4" />
            New project
          </Button>
        }
      />

      {creating ? (
        <form
          onSubmit={handleCreate}
          className="mt-6 rounded-xl border border-border bg-surface p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Onboarding flow"
              autoFocus
            />
            <Input
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="submit" size="sm" loading={createProject.isPending}>
              Create
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {projects.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No projects yet"
            description="Create the first project so the team has a place to put tasks."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                New project
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                to={`/app/projects/${project.id}`}
                className="block h-full rounded-xl border border-border bg-surface p-4 transition hover:border-primary/40 hover:bg-surface-muted"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-h4 font-semibold">
                    {project.name}
                  </h2>
                  <Badge tone="muted">
                    {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                  </Badge>
                </div>
                {project.description ? (
                  <p className="mt-2 line-clamp-2 text-body-sm text-muted-foreground">
                    {project.description}
                  </p>
                ) : null}
                <p className="mt-4 text-caption text-muted-foreground">
                  {project._count?.tasks ?? 0} tasks
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
