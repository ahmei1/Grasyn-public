import { SessionLoading } from '../auth/RouteGuards'
import { useWorkspace } from './WorkspaceContext'
import { WorkspaceOnboardingPage } from './WorkspaceOnboardingPage'

/**
 * Waits for the team list before showing the app sidebar.
 * No team yet → the "create a workspace" screen instead.
 */
export function WorkspaceGate({ children }) {
  const { isLoading, error, activeWorkspace, reload } = useWorkspace()

  if (isLoading) return <SessionLoading />

  if (error) {
    return (
      <div className="grid min-h-svh place-items-center px-6">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-display text-h3 font-semibold">
            Could not load your workspaces
          </p>
          <p className="mt-2 text-body-sm text-muted-foreground">
            {error.message ?? 'Please try again.'}
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-4 cursor-pointer text-body-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!activeWorkspace) return <WorkspaceOnboardingPage />

  return children
}
