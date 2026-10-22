export function ChapterLabel({ index, children, tone = 'light' }) {
  return (
    <p
      className={`inline-flex items-center gap-3 text-caption font-semibold uppercase tracking-[0.2em] ${
        tone === 'dark' ? 'text-brand-300' : 'text-primary'
      }`}
    >
      <span
        className={`grid size-7 place-items-center rounded-full border font-display text-[11px] tracking-normal ${
          tone === 'dark' ? 'border-brand-300/40' : 'border-primary/30'
        }`}
      >
        {String(index).padStart(2, '0')}
      </span>
      {children}
    </p>
  )
}
