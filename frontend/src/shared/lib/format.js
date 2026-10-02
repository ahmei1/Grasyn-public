const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const shortDate = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
})
const shortDateTime = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

const DIVISIONS = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

/** "3 hours ago" — easier to scan than a raw timestamp. */
export function formatRelativeTime(iso) {
  if (!iso) return ''
  let duration = (new Date(iso).getTime() - Date.now()) / 1000
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relative.format(Math.round(duration), division.unit)
    }
    duration /= division.amount
  }
  return ''
}

export function formatDate(iso) {
  if (!iso) return ''
  return shortDate.format(new Date(iso))
}

export function formatDateTime(iso) {
  if (!iso) return ''
  return shortDateTime.format(new Date(iso))
}

/** YYYY-MM-DD for <input type="date">. */
export function toDateInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function isOverdue(iso) {
  if (!iso) return false
  const due = new Date(iso)
  due.setHours(23, 59, 59, 999)
  return due.getTime() < Date.now()
}
