import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import {
  formatDate,
  formatDateTime,
  fromDateTimeInput,
  toDateTimeInput,
} from '../../shared/lib/format'
import { TASK_STATUS_LABELS, TASK_STATUS_TONE } from '../../shared/lib/labels'
import {
  canEditMeeting,
  canOrganizeMeeting,
  isWorkspaceManager,
} from '../../shared/lib/permissions'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Select } from '../../shared/ui/Select'
import { notify } from '../../shared/ui/notify'
import { PageHeader, QueryError, Skeleton } from '../../shared/ui/PageState'

const textareaClass =
  'w-full rounded-lg border border-border bg-surface p-3 text-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

export function MeetingDetailPage() {
  const { meetingId } = useParams()
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null)

  const meetingQuery = useQuery({
    queryKey: keys.meeting(meetingId),
    queryFn: () => api.get(`/meetings/${meetingId}`),
  })
  const membersQuery = useQuery({
    queryKey: keys.members(activeWorkspace.id),
    queryFn: () => api.get(`/workspaces/${activeWorkspace.id}/members`),
  })
  const members = membersQuery.data?.members ?? []

  const meeting = meetingQuery.data?.meeting
  const projectId = meeting?.projectId

  function store(data) {
    queryClient.setQueryData(keys.meeting(meetingId), { meeting: data.meeting })
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: keys.meetings(projectId) })
    }
  }

  const update = useMutation({
    mutationFn: (body) => api.patch(`/meetings/${meetingId}`, body),
    onSuccess: (data) => {
      store(data)
      setEditing(null)
    },
    onError: (error) => notify.apiError(error),
  })
  const remove = useMutation({
    mutationFn: () => api.del(`/meetings/${meetingId}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.meeting(meetingId) })
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: keys.meetings(projectId) })
      }
      notify.success('Meeting deleted.')
      navigate(projectId ? `/app/projects/${projectId}?tab=meetings` : '/app')
    },
    onError: (error) => notify.apiError(error),
  })
  // One mutation for the small list edits; each returns the fresh meeting.
  const change = useMutation({
    mutationFn: ({ method, path, body }) =>
      method === 'del'
        ? api.del(`/meetings/${meetingId}${path}`)
        : api.post(`/meetings/${meetingId}${path}`, body),
    onSuccess: store,
    onError: (error) => notify.apiError(error),
  })
  const convert = useMutation({
    mutationFn: (itemId) =>
      api.post(`/meetings/${meetingId}/action-items/${itemId}/task`),
    onSuccess: (data) => {
      store(data)
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: keys.projectTasks(projectId) })
        queryClient.invalidateQueries({ queryKey: keys.project(projectId) })
      }
      notify.success('Task created.')
    },
    onError: (error) => notify.apiError(error),
  })

  if (meetingQuery.isPending) return <Skeleton className="h-64" />
  if (meetingQuery.isError) {
    return <QueryError title="Meeting not found" error={meetingQuery.error} />
  }

  const role = activeWorkspace.role
  const canEdit = canEditMeeting(role, user.id, meeting)
  const canOrganize = canOrganizeMeeting(role, user.id, meeting)
  const seatedIds = new Set(meeting.participants.map((seat) => seat.userId))
  const invitable = members.filter((member) => !seatedIds.has(member.user.id))

  return (
    <div className="space-y-8">
      <div>
        {meeting.project ? (
          <Link
            to={`/app/projects/${meeting.project.id}?tab=meetings`}
            className="mb-4 inline-flex items-center gap-1.5 text-body-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {meeting.project.name}
          </Link>
        ) : null}
        <PageHeader
          title={meeting.title}
          description={`${formatDateTime(meeting.startsAt)}${meeting.endsAt ? ` – ${formatDateTime(meeting.endsAt)}` : ''} · organized by ${meeting.createdBy?.name}`}
          actions={
            <>
              {canEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEditing({
                      title: meeting.title,
                      startsAt: toDateTimeInput(meeting.startsAt),
                      endsAt: toDateTimeInput(meeting.endsAt),
                    })
                  }
                >
                  <Pencil className="size-4" />
                  Edit
                </Button>
              ) : null}
              {canOrganize ? (
                <Button
                  size="sm"
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete "${meeting.title}"? Tasks already created from it stay.`,
                      )
                    ) {
                      remove.mutate()
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              ) : null}
            </>
          }
        />

        {editing ? (
          <form
            className="mt-4 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!editing.title.trim() || !editing.startsAt) return
              update.mutate({
                title: editing.title.trim(),
                startsAt: fromDateTimeInput(editing.startsAt),
                endsAt: fromDateTimeInput(editing.endsAt),
              })
            }}
          >
            <div className="sm:col-span-2">
              <Input
                label="Meeting title"
                value={editing.title}
                maxLength={160}
                onChange={(event) =>
                  setEditing((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                autoFocus
              />
            </div>
            <Input
              label="Starts"
              type="datetime-local"
              value={editing.startsAt}
              onChange={(event) =>
                setEditing((current) => ({
                  ...current,
                  startsAt: event.target.value,
                }))
              }
            />
            <Input
              label="Ends (optional)"
              type="datetime-local"
              value={editing.endsAt}
              min={editing.startsAt}
              onChange={(event) =>
                setEditing((current) => ({
                  ...current,
                  endsAt: event.target.value,
                }))
              }
            />
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" size="sm" loading={update.isPending}>
                Save changes
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-8">
          <Notes
            key={meeting.id}
            notes={meeting.notes}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={(notes) => update.mutateAsync({ notes })}
          />

          <Decisions
            decisions={meeting.decisions}
            canEdit={canEdit}
            pending={change.isPending}
            onAdd={(body) =>
              change.mutateAsync({ method: 'post', path: '/decisions', body: { body } })
            }
            onRemove={(id) =>
              change.mutate({ method: 'del', path: `/decisions/${id}` })
            }
          />

          <ActionItems
            items={meeting.actionItems}
            members={members}
            canEdit={canEdit}
            isManager={isWorkspaceManager(role)}
            pending={change.isPending}
            convertingId={convert.isPending ? convert.variables : null}
            onAdd={(body) =>
              change.mutateAsync({ method: 'post', path: '/action-items', body })
            }
            onRemove={(id) =>
              change.mutate({ method: 'del', path: `/action-items/${id}` })
            }
            onConvert={(id) => convert.mutate(id)}
          />
        </div>

        <Participants
          participants={meeting.participants}
          invitable={invitable}
          canEdit={canEdit}
          organizerId={meeting.createdById}
          onAdd={(userId) =>
            change.mutate({ method: 'post', path: '/participants', body: { userId } })
          }
          onRemove={(userId) =>
            change.mutate({ method: 'del', path: `/participants/${userId}` })
          }
        />
      </div>
    </div>
  )
}

function Notes({ notes, canEdit, saving, onSave }) {
  // null means "not touched", so live updates from teammates still show.
  const [draft, setDraft] = useState(null)
  const value = draft ?? notes
  const dirty = draft !== null && draft !== notes

  return (
    <section>
      <h2 className="font-display text-h4 font-semibold">Notes</h2>
      {canEdit ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              await onSave(value)
              setDraft(null)
            } catch {
              // Kept the draft; the error toast already showed.
            }
          }}
        >
          <label htmlFor="meeting-notes" className="sr-only">
            Meeting notes
          </label>
          <textarea
            id="meeting-notes"
            rows={8}
            maxLength={20000}
            value={value}
            placeholder="Agenda, what was discussed, open questions…"
            onChange={(event) => setDraft(event.target.value)}
            className={textareaClass}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" loading={saving} disabled={!dirty}>
              Save notes
            </Button>
            {dirty ? (
              <span className="text-caption text-muted-foreground">
                Unsaved changes
              </span>
            ) : null}
          </div>
        </form>
      ) : notes ? (
        <p className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-body-sm">
          {notes}
        </p>
      ) : (
        <p className="mt-3 text-body-sm text-muted-foreground">No notes yet.</p>
      )}
    </section>
  )
}

function Decisions({ decisions, canEdit, pending, onAdd, onRemove }) {
  const [body, setBody] = useState('')

  return (
    <section>
      <h2 className="font-display text-h4 font-semibold">Decisions</h2>
      {decisions.length === 0 ? (
        <p className="mt-3 text-body-sm text-muted-foreground">
          Nothing decided yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {decisions.map((decision) => (
            <li
              key={decision.id}
              className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" />
              <p className="flex-1 whitespace-pre-wrap text-body-sm">
                {decision.body}
              </p>
              {canEdit ? (
                <button
                  type="button"
                  aria-label="Remove decision"
                  onClick={() => onRemove(decision.id)}
                  className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-error"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!body.trim()) return
            try {
              await onAdd(body.trim())
              setBody('')
            } catch {
              // Error toast already shown.
            }
          }}
        >
          <div className="flex-1">
            <Input
              aria-label="New decision"
              value={body}
              maxLength={1000}
              placeholder="We will ship the beta on Friday"
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <Button type="submit" size="md" variant="outline" loading={pending} disabled={!body.trim()}>
            <Plus className="size-4" />
            Add
          </Button>
        </form>
      ) : null}
    </section>
  )
}

function ActionItems({
  items,
  members,
  canEdit,
  isManager,
  pending,
  convertingId,
  onAdd,
  onRemove,
  onConvert,
}) {
  const empty = { title: '', assigneeId: '', dueDate: '' }
  const [form, setForm] = useState(empty)

  return (
    <section>
      <h2 className="font-display text-h4 font-semibold">Action items</h2>
      <p className="mt-1 text-caption text-muted-foreground">
        Follow-ups agreed in the meeting. Turn one into a task to track it on
        the board.
        {isManager
          ? ''
          : ' Items with an assignee or due date need a workspace admin to become tasks.'}
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-body-sm text-muted-foreground">
          No action items yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{item.title}</p>
                <p className="mt-0.5 text-caption text-muted-foreground">
                  {item.assignee?.name ?? 'Unassigned'}
                  {item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ''}
                </p>
              </div>
              {item.task ? (
                <Link
                  to={`/app/tasks/${item.task.id}`}
                  className="inline-flex items-center gap-2 text-caption font-medium text-primary hover:underline"
                >
                  Open task
                  <Badge tone={TASK_STATUS_TONE[item.task.status]}>
                    {TASK_STATUS_LABELS[item.task.status]}
                  </Badge>
                </Link>
              ) : canEdit ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={convertingId === item.id}
                    onClick={() => onConvert(item.id)}
                  >
                    Create task
                  </Button>
                  <button
                    type="button"
                    aria-label="Remove action item"
                    onClick={() => onRemove(item.id)}
                    className="cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-error"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <Badge tone="muted">Not a task yet</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form
          className="mt-3 grid gap-2 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem_auto] sm:items-end"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!form.title.trim()) return
            try {
              await onAdd({
                title: form.title.trim(),
                assigneeId: form.assigneeId || undefined,
                dueDate: form.dueDate || undefined,
              })
              setForm(empty)
            } catch {
              // Error toast already shown.
            }
          }}
        >
          <Input
            label="Action item"
            value={form.title}
            maxLength={200}
            placeholder="Draft the release notes"
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
          />
          <Select
            label="Owner"
            value={form.assigneeId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                assigneeId: event.target.value,
              }))
            }
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.name}
              </option>
            ))}
          </Select>
          <Input
            label="Due"
            type="date"
            value={form.dueDate}
            onChange={(event) =>
              setForm((current) => ({ ...current, dueDate: event.target.value }))
            }
          />
          <Button type="submit" variant="outline" loading={pending} disabled={!form.title.trim()}>
            <Plus className="size-4" />
            Add
          </Button>
        </form>
      ) : null}
    </section>
  )
}

function Participants({
  participants,
  invitable,
  canEdit,
  organizerId,
  onAdd,
  onRemove,
}) {
  return (
    <aside className="h-fit rounded-xl border border-border bg-surface p-4">
      <h2 className="font-display text-body font-semibold">
        Participants ({participants.length})
      </h2>
      <ul className="mt-3 space-y-2">
        {participants.map((seat) => (
          <li key={seat.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-body-sm">
              {seat.user.name}
              {seat.userId === organizerId ? (
                <span className="ml-1.5 text-caption text-muted-foreground">
                  organizer
                </span>
              ) : null}
            </span>
            {canEdit && seat.userId !== organizerId ? (
              <button
                type="button"
                aria-label={`Remove ${seat.user.name}`}
                onClick={() => onRemove(seat.userId)}
                className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-error"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit && invitable.length > 0 ? (
        <div className="mt-4">
          <Select
            label="Add someone"
            value=""
            onChange={(event) => {
              if (event.target.value) onAdd(event.target.value)
            }}
          >
            <option value="">Choose a teammate</option>
            {invitable.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </aside>
  )
}
