import { useState } from 'react'
import clsx from 'clsx'
import { Check, Copy } from 'lucide-react'
import { useWorkspace } from '../../features/workspaces/WorkspaceContext'

function taskKey(prefix, number) {
  return prefix && number ? `${prefix}-${number}` : null
}

/** The short key developers type in branches and commits, e.g. LUM-42. */
export function TaskKey({ task, copyable = false, className }) {
  const { activeWorkspace } = useWorkspace()
  const [copied, setCopied] = useState(false)
  const key = taskKey(activeWorkspace?.taskPrefix, task?.number)
  if (!key) return null

  const label = (
    <span className="font-mono text-caption font-medium tracking-tight">
      {key}
    </span>
  )

  if (!copyable) {
    return (
      <span className={clsx('shrink-0 text-muted-foreground', className)}>
        {label}
      </span>
    )
  }

  return (
    <button
      type="button"
      title="Copy task key"
      aria-label={copied ? `Copied ${key}` : `Copy task key ${key}`}
      onClick={() => {
        navigator.clipboard
          ?.writeText(key)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => {})
      }}
      className={clsx(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-0.5 text-muted-foreground transition hover:bg-surface-muted hover:text-foreground',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        className,
      )}
    >
      {label}
      {copied ? (
        <Check className="size-3.5 text-success-600" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </button>
  )
}
