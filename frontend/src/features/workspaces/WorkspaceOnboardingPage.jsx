import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
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
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_0.9fr]">
        <section>
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
        </section>

        <aside className="rounded-2xl border border-border bg-surface p-6">
          <p className="font-display text-h4 font-semibold">
            What happens next?
          </p>
          <ol className="mt-4 space-y-4">
            {[
              'Create your team workspace.',
              'Invite members and choose their roles.',
              'Create your first project.',
              'Add tasks, assign owners, and track progress.',
            ].map((item) => (
              <li key={item} className="flex gap-3 text-body-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 rounded-xl bg-primary/10 p-4 text-body-sm text-primary">
            Start small. One workspace and one project is enough to begin using
            GraSyn clearly.
          </p>
        </aside>
      </div>
    </main>
  )
}
