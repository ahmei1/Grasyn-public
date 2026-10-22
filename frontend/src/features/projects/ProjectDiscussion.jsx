import { useEffect, useRef, useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { api } from '../../shared/api/client'
import { keys } from '../../shared/api/keys'
import { formatRelativeTime } from '../../shared/lib/format'
import { isWorkspaceManager } from '../../shared/lib/permissions'
import { Button } from '../../shared/ui/Button'
import { notify } from '../../shared/ui/notify'
import { QueryError, Skeleton } from '../../shared/ui/PageState'

const PAGE_SIZE = 50

const textareaClass =
  'w-full resize-none rounded-lg border border-border bg-surface p-3 text-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

export function ProjectDiscussion({ projectId }) {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const listRef = useRef(null)
  const lastSeenId = useRef(null)
  const isManager = isWorkspaceManager(activeWorkspace.role)

  const messagesQuery = useInfiniteQuery({
    queryKey: keys.messages(projectId),
    queryFn: ({ pageParam }) =>
      api.get(
        `/projects/${projectId}/messages?limit=${PAGE_SIZE}${pageParam ? `&before=${pageParam}` : ''}`,
      ),
    initialPageParam: null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.messages[0]?.id : undefined,
  })

  // Pages arrive newest-first; each page is already oldest-first inside.
  const messages = (messagesQuery.data?.pages ?? [])
    .toReversed()
    .flatMap((page) => page.messages)
  const newestId = messages.at(-1)?.id

  useEffect(() => {
    if (!newestId || newestId === lastSeenId.current) return
    lastSeenId.current = newestId
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
    // Reading the thread here counts as reading its notification.
    api
      .post(`/projects/${projectId}/messages/read`)
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: keys.notifications(activeWorkspace.id),
        }),
      )
      .catch(() => {})
  }, [newestId, projectId, queryClient, activeWorkspace.id])

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: keys.messages(projectId) })

  const send = useMutation({
    mutationFn: (text) =>
      api.post(`/projects/${projectId}/messages`, { body: text }),
    onSuccess: () => {
      setBody('')
      refresh()
    },
    onError: (error) => notify.apiError(error),
  })
  const edit = useMutation({
    mutationFn: ({ id, text }) => api.patch(`/messages/${id}`, { body: text }),
    onSuccess: refresh,
    onError: (error) => notify.apiError(error),
  })
  const remove = useMutation({
    mutationFn: (id) => api.del(`/messages/${id}`),
    onSuccess: refresh,
    onError: (error) => notify.apiError(error),
  })

  function submit(event) {
    event.preventDefault()
    const text = body.trim()
    if (!text || send.isPending) return
    send.mutate(text)
  }

  if (messagesQuery.isError) {
    return (
      <QueryError
        title="Could not load the discussion"
        error={messagesQuery.error}
        onRetry={() => messagesQuery.refetch()}
      />
    )
  }

  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface">
      <div
        ref={listRef}
        className="max-h-[28rem] min-h-48 overflow-y-auto p-4"
        aria-live="polite"
      >
        {messagesQuery.isPending ? (
          <Skeleton className="h-32" />
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-body-sm text-muted-foreground">
            No messages yet. Ask a question or share an update with the team.
          </p>
        ) : (
          <>
            {messagesQuery.hasNextPage ? (
              <div className="mb-3 flex justify-center">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={messagesQuery.isFetchingNextPage}
                  onClick={() => messagesQuery.fetchNextPage()}
                >
                  Load older messages
                </Button>
              </div>
            ) : null}
            <ul className="space-y-3">
              {messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  canEdit={message.author?.id === user.id}
                  canDelete={message.author?.id === user.id || isManager}
                  onEdit={(text) => edit.mutateAsync({ id: message.id, text })}
                  onDelete={() => {
                    if (window.confirm('Delete this message?')) {
                      remove.mutate(message.id)
                    }
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row sm:items-end"
      >
        <label htmlFor="discussion-message" className="sr-only">
          Message
        </label>
        <textarea
          id="discussion-message"
          rows={2}
          maxLength={4000}
          value={body}
          placeholder="Write a message. Enter sends, Shift+Enter adds a line."
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) submit(event)
          }}
          className={textareaClass}
        />
        <Button
          type="submit"
          size="sm"
          loading={send.isPending}
          disabled={!body.trim()}
        >
          Send
        </Button>
      </form>
    </section>
  )
}

function MessageItem({ message, canEdit, canDelete, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [saving, setSaving] = useState(false)

  async function save(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setSaving(true)
    try {
      await onEdit(text)
      setEditing(false)
    } catch {
      // The mutation already showed the error.
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="group">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-caption font-medium">
          {message.author?.name}
          <span className="ml-2 font-normal text-muted-foreground">
            {formatRelativeTime(message.createdAt)}
            {message.editedAt ? ' · edited' : ''}
          </span>
        </p>
        {!editing && (canEdit || canDelete) ? (
          <div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            {canEdit ? (
              <button
                type="button"
                aria-label="Edit message"
                onClick={() => {
                  setDraft(message.body)
                  setEditing(true)
                }}
                className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                aria-label="Delete message"
                onClick={onDelete}
                className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-error"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {editing ? (
        <form onSubmit={save} className="mt-1 flex flex-col gap-2">
          <textarea
            rows={2}
            maxLength={4000}
            value={draft}
            aria-label="Edit message"
            onChange={(event) => setDraft(event.target.value)}
            className={textareaClass}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={saving}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap text-body-sm">{message.body}</p>
      )}
    </li>
  )
}
