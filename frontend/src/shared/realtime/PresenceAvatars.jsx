import clsx from 'clsx'
import { useAuth } from '../../features/auth/AuthContext'
import { usePresence } from './presence'

const MAX_FACES = 4

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

function Face({ name, className }) {
  return (
    <span
      title={name}
      className={clsx(
        'relative inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-surface bg-primary/15 text-[11px] font-semibold text-primary',
        className,
      )}
    >
      {initials(name)}
      <span
        aria-hidden="true"
        className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-success-500"
      />
    </span>
  )
}

function names(members) {
  const list = members.map((member) => member.name)
  if (list.length <= 2) return list.join(' and ')
  return `${list.slice(0, 2).join(', ')} and ${list.length - 2} more`
}

/** Teammates online in this workspace, for the sidebar. */
export function OnlineMembers() {
  const { user } = useAuth()
  const others = usePresence().filter((member) => member.userId !== user?.id)

  return (
    <div className="border-t border-border px-5 py-3">
      <p className="text-caption font-medium text-muted-foreground">
        {others.length === 0 ? 'No teammates online' : `Online now · ${others.length}`}
      </p>
      {others.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {others.slice(0, 6).map((member) => (
            <li key={member.userId} className="flex min-w-0 items-center gap-2">
              <Face name={member.name} className="size-6 text-[10px]" />
              <span className="truncate text-body-sm">{member.name}</span>
            </li>
          ))}
          {others.length > 6 ? (
            <li className="text-caption text-muted-foreground">+{others.length - 6} more</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * Other people who have this project or task open right now.
 * Renders nothing when the viewer is alone.
 */
export function ViewingNow({ projectId, taskId, className }) {
  const { user } = useAuth()
  const viewers = usePresence().filter(
    (member) =>
      member.userId !== user?.id &&
      (taskId ? member.taskIds.includes(taskId) : member.projectIds.includes(projectId)),
  )
  if (viewers.length === 0) return null

  const place = taskId ? 'this task' : 'this project'
  return (
    <div
      className={clsx('flex items-center gap-2', className)}
      aria-label={`${names(viewers)} ${viewers.length === 1 ? 'is' : 'are'} also viewing ${place}`}
    >
      <div className="flex -space-x-2">
        {viewers.slice(0, MAX_FACES).map((member) => (
          <Face key={member.userId} name={member.name} />
        ))}
        {viewers.length > MAX_FACES ? (
          <span className="inline-flex size-7 items-center justify-center rounded-full border-2 border-surface bg-muted text-[11px] font-semibold text-muted-foreground">
            +{viewers.length - MAX_FACES}
          </span>
        ) : null}
      </div>
      <span className="text-caption text-muted-foreground">
        {names(viewers)} {viewers.length === 1 ? 'is' : 'are'} also here
      </span>
    </div>
  )
}
