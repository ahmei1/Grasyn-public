import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from './WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { ROLE_LABELS } from '../../shared/lib/labels'
import {
  canAssignAdmin,
  canManageMember,
  isWorkspaceManager,
} from '../../shared/lib/permissions'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Select } from '../../shared/ui/Select'
import { notify } from '../../shared/ui/notify'
import { PageHeader, QueryError, Skeleton } from '../../shared/ui/PageState'

export function WorkspaceSettingsPage() {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace.id
  const canManage = isWorkspaceManager(activeWorkspace.role)
  const isOwner = activeWorkspace.role === 'OWNER'
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('MEMBER')
  const [lastInviteUrl, setLastInviteUrl] = useState('')

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.members(workspaceId),
    queryFn: () => api.get(`/workspaces/${workspaceId}/members`),
  })

  const invite = useMutation({
    mutationFn: (body) =>
      api.post(`/workspaces/${workspaceId}/invites`, body),
    onSuccess: (result) => {
      const token = result.invite?.token
      if (token) {
        setLastInviteUrl(`${window.location.origin}/invite/${token}`)
      }
      setEmail('')
      notify.success('Invite created. Copy the link below — email is not sent yet.')
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })

  const updateRole = useMutation({
    mutationFn: ({ userId, nextRole }) =>
      api.patch(`/workspaces/${workspaceId}/members/${userId}`, {
        role: nextRole,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.members(workspaceId) })
      notify.success('Role updated.')
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })

  const removeMember = useMutation({
    mutationFn: (userId) =>
      api.del(`/workspaces/${workspaceId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.members(workspaceId) })
      notify.success('Member removed.')
    },
    onError: (mutationError) => notify.apiError(mutationError),
  })

  if (isPending) return <Skeleton className="h-64" />
  if (isError) return <QueryError error={error} onRetry={refetch} />

  const members = data.members ?? []

  return (
    <div>
      <PageHeader
        title="Workspace settings"
        description={`${activeWorkspace.name} · your role is ${ROLE_LABELS[activeWorkspace.role] ?? activeWorkspace.role}`}
      />

      {canManage ? (
        <form
          className="mt-8 rounded-xl border border-border bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!email.trim()) return
            invite.mutate({
              email: email.trim(),
              role: canAssignAdmin(activeWorkspace.role) ? role : 'MEMBER',
            })
          }}
        >
          <h2 className="font-display text-h4 font-semibold">Invite someone</h2>
          <p className="mt-1 text-body-sm text-muted-foreground">
            We create a link. You send it. (Email sending is not built yet.)
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@company.com"
            />
            <Select
              label="Role"
              value={isOwner ? role : 'MEMBER'}
              disabled={!isOwner}
              hint={!isOwner ? 'Only the Owner can invite an Admin.' : undefined}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="MEMBER">Member</option>
              {isOwner ? <option value="ADMIN">Admin</option> : null}
            </Select>
            <div className="flex items-end">
              <Button type="submit" loading={invite.isPending}>
                Create invite
              </Button>
            </div>
          </div>
          {lastInviteUrl ? (
            <p className="mt-4 break-all text-body-sm">
              Invite link:{' '}
              <button
                type="button"
                className="cursor-pointer text-primary hover:underline"
                onClick={async () => {
                  await navigator.clipboard.writeText(lastInviteUrl)
                  notify.success('Link copied.')
                }}
              >
                {lastInviteUrl}
              </button>
            </p>
          ) : null}
        </form>
      ) : null}

      <h2 className="mt-8 font-display text-h4 font-semibold">Members</h2>
      <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="font-medium">{member.user.name}</p>
              <p className="text-caption text-muted-foreground">
                {member.user.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canManageMember(activeWorkspace.role, member.role) ? (
                <>
                  {isOwner ? (
                    <Select
                      aria-label={`Role for ${member.user.name}`}
                      value={member.role}
                      onChange={(event) =>
                        updateRole.mutate({
                          userId: member.user.id,
                          nextRole: event.target.value,
                        })
                      }
                      className="w-32"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                    </Select>
                  ) : (
                    <Badge tone="muted">{ROLE_LABELS[member.role]}</Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${member.user.name} from this workspace?`,
                        )
                      ) {
                        removeMember.mutate(member.user.id)
                      }
                    }}
                  >
                    Remove
                  </Button>
                </>
              ) : (
                <Badge tone="muted">{ROLE_LABELS[member.role]}</Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
