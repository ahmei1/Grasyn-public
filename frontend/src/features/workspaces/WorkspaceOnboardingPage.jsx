import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Logo } from '../../shared/ui/Logo'
import { notify } from '../../shared/ui/notify'
import { useWorkspace } from './WorkspaceContext'

/**
 * First screen after sign-up if you do not belong to a team yet.
 * A workspace is the team folder every project and task lives in.
 */
export function WorkspaceOnboardingPage() {
  const { createWorkspace } = useWorkspace()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('Give your workspace a name of at least 2 characters.')
      return
    }
    setSubmitting(true)
    try {
      await createWorkspace(trimmed)
      notify.success('Workspace ready.')
    } catch (submitError) {
      notify.apiError(submitError)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (logoutError) {
      notify.apiError(logoutError)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <Logo size="sm" />
        <h1 className="mt-10 font-display text-h1 font-semibold tracking-tight">
          Name your workspace
        </h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          This is the shared home for {user?.name?.split(' ')[0] ?? 'your'}{' '}
          team — projects, tasks, and activity all live here.
        </p>

        <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="Workspace name"
            placeholder="Lumen Labs"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError('')
            }}
            error={error}
            autoFocus
          />
          <Button type="submit" loading={submitting}>
            Create workspace
          </Button>
        </form>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-8 cursor-pointer text-body-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Sign out
        </button>
      </div>
    </main>
  )
}
