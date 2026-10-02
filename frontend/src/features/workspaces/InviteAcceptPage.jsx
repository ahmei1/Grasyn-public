import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from './WorkspaceContext'
import { api } from '../../shared/api/client'
import { ROLE_LABELS } from '../../shared/lib/labels'
import { Button } from '../../shared/ui/Button'
import { Logo } from '../../shared/ui/Logo'
import { notify } from '../../shared/ui/notify'
import { QueryError, Skeleton } from '../../shared/ui/PageState'

export function InviteAcceptPage() {
  const { token } = useParams()
  const { isAuthenticated, isLoading } = useAuth()
  const { reload, setActiveWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const location = useLocation()

  const inviteQuery = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get(`/invites/${token}`),
  })

  const accept = useMutation({
    mutationFn: () => api.post(`/invites/${token}/accept`),
    onSuccess: async (data) => {
      await reload()
      if (data.workspaceId) setActiveWorkspace(data.workspaceId)
      notify.success('You joined the workspace.')
      navigate('/app', { replace: true })
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <Logo size="sm" />
        <h1 className="mt-10 font-display text-h1 font-semibold tracking-tight">
          Join a workspace
        </h1>

        {inviteQuery.isPending || isLoading ? (
          <Skeleton className="mt-8 h-40" />
        ) : inviteQuery.isError ? (
          <div className="mt-8">
            <QueryError
              title="This invite does not work"
              error={inviteQuery.error}
            />
            <Link
              to="/login"
              className="mt-4 inline-block text-body-sm font-medium text-primary hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-border bg-surface p-5">
            <p className="text-body-sm text-muted-foreground">You are invited to</p>
            <p className="mt-1 font-display text-h3 font-semibold">
              {inviteQuery.data.invite.workspace.name}
            </p>
            <p className="mt-2 text-body-sm text-muted-foreground">
              Role: {ROLE_LABELS[inviteQuery.data.invite.role] ?? inviteQuery.data.invite.role}
            </p>

            {!isAuthenticated ? (
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  className="w-full"
                  onClick={() =>
                    navigate('/login', { state: { from: location } })
                  }
                >
                  Sign in to accept
                </Button>
                <Link
                  to="/register"
                  state={{ from: location }}
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-surface text-body-sm font-medium hover:bg-surface-muted"
                >
                  Create an account
                </Link>
              </div>
            ) : (
              <Button
                className="mt-6 w-full"
                loading={accept.isPending}
                onClick={() => accept.mutate()}
              >
                Accept invite
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
