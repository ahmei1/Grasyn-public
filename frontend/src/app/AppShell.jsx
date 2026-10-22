import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  Activity,
  Bell,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Settings,
  UserRound,
  X,
} from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { useWorkspace } from '../features/workspaces/WorkspaceContext'
import { api } from '../shared/api/client'
import { keys } from '../shared/api/keys'
import { OnlineMembers } from '../shared/realtime/PresenceAvatars'
import { PresenceContext } from '../shared/realtime/presence'
import { useWorkspaceRealtime } from '../shared/realtime/useWorkspaceRealtime'
import { ROLE_LABELS } from '../shared/lib/labels'
import { Badge } from '../shared/ui/Badge'
import { Button } from '../shared/ui/Button'
import { Logo } from '../shared/ui/Logo'
import { notify } from '../shared/ui/notify'

const NAV = [
  { name: 'Dashboard', to: '/app', icon: LayoutDashboard, end: true },
  { name: 'Projects', to: '/app/projects', icon: FolderKanban },
  { name: 'My tasks', to: '/app/tasks', icon: ListTodo },
  { name: 'Activity', to: '/app/activity', icon: Activity },
  { name: 'Notifications', to: '/app/notifications', icon: Bell },
  { name: 'Settings', to: '/app/settings/workspace', icon: Settings },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const mainRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const presence = useWorkspaceRealtime(activeWorkspace.id)

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  const { data: notificationData } = useQuery({
    queryKey: keys.notificationSummary(activeWorkspace.id),
    queryFn: () =>
      api.get(`/workspaces/${activeWorkspace.id}/notifications?pageSize=1`),
    refetchInterval: 30_000,
  })
  const unreadCount = notificationData?.unreadCount ?? 0
  const roleLabel = ROLE_LABELS[activeWorkspace.role] ?? activeWorkspace.role

  async function handleLogout() {
    try {
      await logout()
      notify.success('Signed out.')
      navigate('/login', { replace: true })
    } catch (error) {
      notify.apiError(error)
    }
  }

  const sidebar = (
    <>
      <div className="border-b border-border px-5 py-4">
        <NavLink
          to="/app"
          end
          onClick={() => setMenuOpen(false)}
          className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Logo size="sm" />
        </NavLink>
        {workspaces.length > 1 ? (
          <label className="mt-4 block">
            <span className="sr-only">Workspace</span>
            <select
              value={activeWorkspace.id}
              onChange={(event) => setActiveWorkspace(event.target.value)}
              className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-border bg-surface px-2 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <Badge tone="muted" className="mt-2">
              {roleLabel}
            </Badge>
          </label>
        ) : (
          <div className="mt-3">
            <p className="truncate text-body-sm font-medium">
              {activeWorkspace.name}
            </p>
            <Badge tone="muted" className="mt-2">
              {roleLabel}
            </Badge>
          </div>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const Icon = item.icon
          const showBadge = item.to === '/app/notifications' && unreadCount > 0
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'inline-flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm font-medium transition duration-200',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
                )
              }
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="flex-1">{item.name}</span>
              {showBadge ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>

      <OnlineMembers />

      <div className="border-t border-border p-3">
        <NavLink
          to="/app/settings/profile"
          onClick={() => setMenuOpen(false)}
          className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <UserRound aria-hidden="true" className="size-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-medium">{user?.name}</p>
            <p className="truncate text-caption text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </NavLink>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut aria-hidden="true" className="size-4" />
          Sign out
        </Button>
      </div>
    </>
  )

  return (
    <PresenceContext.Provider value={presence}>
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-20 cursor-pointer bg-neutral-950/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-60 shrink-0 flex-col border-r border-border bg-surface md:static md:flex md:h-full',
          menuOpen ? 'flex' : 'hidden',
        )}
      >
        {sidebar}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
          <Logo size="sm" />
        </header>
        <main ref={mainRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
    </PresenceContext.Provider>
  )
}
