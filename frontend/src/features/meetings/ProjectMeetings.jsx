import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, ListChecks, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import {
  formatDateTime,
  fromDateTimeInput,
  toDateTimeInput,
} from '../../shared/lib/format'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Checkbox } from '../../shared/ui/Checkbox'
import { Input } from '../../shared/ui/Input'
import { notify } from '../../shared/ui/notify'
import { EmptyState, QueryError, Skeleton } from '../../shared/ui/PageState'

function nextHalfHour() {
  const date = new Date()
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60, 0, 0)
  return toDateTimeInput(date.toISOString())
}

export function ProjectMeetings({ projectId }) {
  const [creating, setCreating] = useState(false)
  const [now] = useState(() => Date.now())
  const meetingsQuery = useQuery({
    queryKey: keys.meetings(projectId),
    queryFn: () => api.get(`/projects/${projectId}/meetings`),
  })
  const meetings = meetingsQuery.data?.meetings ?? []
  const upcoming = meetings
    .filter((meeting) => new Date(meeting.startsAt).getTime() >= now)
    .toReversed()
  const past = meetings.filter(
    (meeting) => new Date(meeting.startsAt).getTime() < now,
  )

  if (meetingsQuery.isError) {
    return (
      <QueryError
        title="Could not load meetings"
        error={meetingsQuery.error}
        onRetry={() => meetingsQuery.refetch()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating((open) => !open)}>
          <CalendarPlus className="size-4" />
          New meeting
        </Button>
      </div>

      {creating ? (
        <NewMeetingForm
          projectId={projectId}
          onDone={() => setCreating(false)}
        />
      ) : null}

      {meetingsQuery.isPending ? (
        <Skeleton className="h-40" />
      ) : meetings.length === 0 ? (
        <EmptyState
          title="No meetings yet"
          description="Record a meeting to keep its notes, decisions, and follow-ups with this project."
        />
      ) : (
        <>
          {upcoming.length > 0 ? (
            <MeetingList title="Upcoming" meetings={upcoming} />
          ) : null}
          {past.length > 0 ? <MeetingList title="Past" meetings={past} /> : null}
        </>
      )}
    </div>
  )
}

function MeetingList({ title, meetings }) {
  return (
    <section>
      <h3 className="mb-2 text-body-sm font-semibold text-muted-foreground">
        {title}
      </h3>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {meetings.map((meeting) => (
          <li key={meeting.id}>
            <Link
              to={`/app/meetings/${meeting.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{meeting.title}</p>
                <p className="mt-0.5 text-caption text-muted-foreground">
                  {formatDateTime(meeting.startsAt)} · organized by{' '}
                  {meeting.createdBy?.name}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-caption text-muted-foreground">
                <span className="inline-flex items-center gap-1" title="Participants">
                  <Users className="size-3.5" />
                  {meeting.participants?.length ?? 0}
                </span>
                {meeting._count?.actionItems ? (
                  <Badge tone="primary">
                    <ListChecks className="mr-1 size-3.5" />
                    {meeting._count.actionItems}
                  </Badge>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NewMeetingForm({ projectId, onDone }) {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(() => ({
    title: '',
    startsAt: nextHalfHour(),
    endsAt: '',
    participantIds: [],
  }))

  const membersQuery = useQuery({
    queryKey: keys.members(activeWorkspace.id),
    queryFn: () => api.get(`/workspaces/${activeWorkspace.id}/members`),
  })
  const teammates = (membersQuery.data?.members ?? []).filter(
    (member) => member.user.id !== user.id,
  )

  const create = useMutation({
    mutationFn: (body) => api.post(`/projects/${projectId}/meetings`, body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: keys.meetings(projectId) })
      notify.success('Meeting created.')
      onDone()
      navigate(`/app/meetings/${data.meeting.id}`)
    },
    onError: (error) => notify.apiError(error),
  })

  function toggle(userId) {
    setForm((current) => ({
      ...current,
      participantIds: current.participantIds.includes(userId)
        ? current.participantIds.filter((id) => id !== userId)
        : [...current.participantIds, userId],
    }))
  }

  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!form.title.trim() || !form.startsAt) return
        create.mutate({
          title: form.title.trim(),
          startsAt: fromDateTimeInput(form.startsAt),
          endsAt: fromDateTimeInput(form.endsAt) ?? undefined,
          participantIds: form.participantIds,
        })
      }}
    >
      <div className="sm:col-span-2">
        <Input
          label="Meeting title"
          value={form.title}
          maxLength={160}
          placeholder="Sprint planning"
          onChange={(event) =>
            setForm((current) => ({ ...current, title: event.target.value }))
          }
          autoFocus
        />
      </div>
      <Input
        label="Starts"
        type="datetime-local"
        value={form.startsAt}
        onChange={(event) =>
          setForm((current) => ({ ...current, startsAt: event.target.value }))
        }
      />
      <Input
        label="Ends (optional)"
        type="datetime-local"
        value={form.endsAt}
        min={form.startsAt}
        onChange={(event) =>
          setForm((current) => ({ ...current, endsAt: event.target.value }))
        }
      />
      <fieldset className="sm:col-span-2">
        <legend className="text-body-sm font-medium">Participants</legend>
        <p className="text-caption text-muted-foreground">
          You are added automatically. Everyone you pick gets a notification.
        </p>
        {teammates.length === 0 ? (
          <p className="mt-2 text-caption text-muted-foreground">
            {membersQuery.isPending
              ? 'Loading teammates…'
              : 'No other teammates in this workspace yet.'}
          </p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {teammates.map((member) => (
              <Checkbox
                key={member.user.id}
                label={member.user.name}
                checked={form.participantIds.includes(member.user.id)}
                onChange={() => toggle(member.user.id)}
              />
            ))}
          </div>
        )}
      </fieldset>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" loading={create.isPending}>
          Create meeting
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
