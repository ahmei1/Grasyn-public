import clsx from 'clsx'
import { Button } from './Button'

export function QueryError({ error, onRetry, title = 'Could not load this page' }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-border bg-surface p-6"
    >
      <p className="font-display text-h4 font-semibold">{title}</p>
      <p className="mt-1 text-body-sm text-muted-foreground">
        {error?.message ?? 'Please try again.'}
      </p>
      {onRetry ? (
        <Button className="mt-4" size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
      <p className="font-display text-h4 font-semibold">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-body-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Skeleton({ className }) {
  return (
    <div
      className={clsx(
        'rounded-xl bg-surface-muted motion-safe:animate-pulse',
        className,
      )}
    />
  )
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-h2 font-semibold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
