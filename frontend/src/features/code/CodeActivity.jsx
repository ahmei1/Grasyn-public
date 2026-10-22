import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ExternalLink,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from 'lucide-react'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { formatRelativeTime } from '../../shared/lib/format'
import { isWorkspaceManager } from '../../shared/lib/permissions'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState, QueryError, Skeleton } from '../../shared/ui/PageState'
import { TaskKey } from '../../shared/ui/TaskKey'

const PULL_STATE = {
  OPEN: { label: 'Open', tone: 'primary', Icon: GitPullRequest },
  DRAFT: { label: 'Draft', tone: 'muted', Icon: GitPullRequestDraft },
  MERGED: { label: 'Merged', tone: 'success', Icon: GitMerge },
  CLOSED: { label: 'Closed', tone: 'error', Icon: GitPullRequestClosed },
}

const REVIEW = {
  APPROVED: { label: 'Approved', tone: 'success' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'warning' },
}

/** Pull requests and commits that mention this task's key. */
export function TaskCode({ task, onMarkDone, marking }) {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.taskCode(task.id),
    queryFn: () => api.get(`/tasks/${task.id}/code`),
  })

  const pullRequests = data?.pullRequests ?? []
  const commits = data?.commits ?? []
  const merged = pullRequests.find((pull) => pull.state === 'MERGED')

  return (
    <section className="mt-10">
      <h2 className="font-display text-h4 font-semibold">Code</h2>
      {isPending ? (
        <Skeleton className="mt-3 h-24" />
      ) : isError ? (
        <QueryError
          title="Could not load linked code"
          error={error}
          onRetry={refetch}
        />
      ) : pullRequests.length === 0 && commits.length === 0 ? (
        <p className="mt-3 text-body-sm text-muted-foreground">
          Nothing linked yet. Put{' '}
          <TaskKey task={task} className="text-foreground" /> in a branch
          name, commit message, or pull request title and it shows up here.
        </p>
      ) : (
        <>
          {merged && task.status !== 'DONE' && onMarkDone ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success-100 bg-success-100/40 px-4 py-3">
              <p className="text-body-sm">
                PR #{merged.number} was merged. Is this task finished?
              </p>
              <Button size="sm" loading={marking} onClick={onMarkDone}>
                Mark as done
              </Button>
            </div>
          ) : null}
          <CodeLists pullRequests={pullRequests} commits={commits} />
        </>
      )}
    </section>
  )
}

/** Code from repositories assigned to the project, plus code naming its tasks. */
export function ProjectCode({ projectId }) {
  const { activeWorkspace } = useWorkspace()
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.projectCode(projectId),
    queryFn: () => api.get(`/projects/${projectId}/code`),
  })

  if (isPending) return <Skeleton className="h-40" />
  if (isError) return <QueryError error={error} onRetry={refetch} />

  const { repositories, pullRequests, commits } = data
  const manager = isWorkspaceManager(activeWorkspace.role)

  return (
    <div>
      {repositories.length ? (
        <div className="flex flex-wrap items-center gap-2 text-body-sm">
          <span className="text-muted-foreground">Repositories:</span>
          {repositories.map((repository) => (
            <a
              key={repository.id}
              href={repository.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 font-mono text-caption hover:border-primary hover:text-primary"
            >
              {repository.fullName}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ))}
        </div>
      ) : null}
      {pullRequests.length === 0 && commits.length === 0 ? (
        <EmptyState
          title="No code yet"
          description={
            repositories.length
              ? 'Pushes and pull requests will appear here as they happen.'
              : 'Assign a GitHub repository to this project in workspace settings. Code that mentions one of its task keys shows up here either way.'
          }
          action={
            manager && !repositories.length ? (
              <Link
                to="/app/settings/workspace"
                className="text-body-sm font-medium text-primary hover:underline"
              >
                Open workspace settings
              </Link>
            ) : null
          }
        />
      ) : (
        <CodeLists pullRequests={pullRequests} commits={commits} showTasks />
      )}
    </div>
  )
}

function CodeLists({ pullRequests, commits, showTasks = false }) {
  return (
    <div className="mt-4 grid gap-8 lg:grid-cols-2">
      <div>
        <h3 className="text-body-sm font-semibold">
          Pull requests{' '}
          <span className="font-normal text-muted-foreground">
            {pullRequests.length}
          </span>
        </h3>
        {pullRequests.length ? (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
            {pullRequests.map((pull) => (
              <PullRequestRow key={pull.id} pull={pull} showTasks={showTasks} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-body-sm text-muted-foreground">None yet.</p>
        )}
      </div>
      <div>
        <h3 className="text-body-sm font-semibold">
          Commits{' '}
          <span className="font-normal text-muted-foreground">
            {commits.length}
          </span>
        </h3>
        {commits.length ? (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
            {commits.map((commit) => (
              <CommitRow key={commit.id} commit={commit} showTasks={showTasks} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-body-sm text-muted-foreground">None yet.</p>
        )}
      </div>
    </div>
  )
}

function PullRequestRow({ pull, showTasks }) {
  const state =
    PULL_STATE[pull.state === 'OPEN' && pull.draft ? 'DRAFT' : pull.state] ??
    PULL_STATE.OPEN
  const review = pull.state === 'OPEN' ? REVIEW[pull.reviewState] : null
  const { Icon } = state
  const when =
    pull.state === 'MERGED'
      ? `merged ${formatRelativeTime(pull.mergedAt)}`
      : pull.state === 'CLOSED'
        ? `closed ${formatRelativeTime(pull.closedAt)}`
        : `opened ${formatRelativeTime(pull.openedAt)}`

  return (
    <li className="flex gap-3 px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <a
          href={pull.url}
          target="_blank"
          rel="noreferrer"
          className="font-medium hover:text-primary hover:underline"
        >
          {pull.title}
        </a>
        <p className="mt-0.5 text-caption text-muted-foreground">
          {pull.repository.fullName} #{pull.number} · {pull.authorLogin} ·{' '}
          {when}
        </p>
        <p className="mt-0.5 truncate font-mono text-caption text-muted-foreground">
          {pull.headBranch} → {pull.baseBranch}
        </p>
        {showTasks ? <LinkedTasks tasks={pull.tasks} /> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={state.tone}>{state.label}</Badge>
        {review ? <Badge tone={review.tone}>{review.label}</Badge> : null}
      </div>
    </li>
  )
}

function CommitRow({ commit, showTasks }) {
  const [subject] = commit.message.split('\n')
  return (
    <li className="flex gap-3 px-4 py-3">
      <GitCommitHorizontal
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{subject}</p>
        <p className="mt-0.5 text-caption text-muted-foreground">
          <a
            href={commit.url}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:text-primary hover:underline"
          >
            {commit.sha.slice(0, 7)}
          </a>{' '}
          · {commit.authorLogin ?? commit.authorName} on{' '}
          <span className="font-mono">{commit.branch}</span> ·{' '}
          {formatRelativeTime(commit.committedAt)}
        </p>
        {showTasks ? <LinkedTasks tasks={commit.tasks} /> : null}
      </div>
    </li>
  )
}

function LinkedTasks({ tasks = [] }) {
  if (!tasks.length) return null
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-caption">
      {tasks.map((task) => (
        <Link
          key={task.id}
          to={`/app/tasks/${task.id}`}
          className="inline-flex items-center gap-1.5 hover:text-primary"
        >
          <TaskKey task={task} />
          <span className="truncate">{task.title}</span>
        </Link>
      ))}
    </p>
  )
}
