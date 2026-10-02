import { useId } from 'react'
import clsx from 'clsx'

const SIZES = {
  md: 'h-10 text-body-sm',
  lg: 'h-12 text-body',
}

export function Select({
  label,
  error,
  hint,
  id,
  size = 'md',
  className,
  children,
  ...rest
}) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const errorId = `${selectId}-error`
  const hintId = `${selectId}-hint`
  const describedBy =
    clsx(error && errorId, hint && !error && hintId) || undefined

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={selectId} className="text-body-sm font-medium">
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(
          'w-full cursor-pointer rounded-lg border bg-surface pr-8 pl-3 transition',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          'disabled:cursor-not-allowed disabled:opacity-60',
          SIZES[size],
          error ? 'border-error' : 'border-border',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} className="text-caption text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
