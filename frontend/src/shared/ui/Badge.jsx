import clsx from 'clsx'

const TONES = {
  muted: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning-100 text-warning-700',
  success: 'bg-success-100 text-success-700',
  error: 'bg-error-100 text-error-700',
}

export function Badge({ tone = 'muted', children, className }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium',
        TONES[tone] ?? TONES.muted,
        className,
      )}
    >
      {children}
    </span>
  )
}
