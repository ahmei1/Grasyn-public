const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
// Due dates are stored as UTC midnight; formatting in local time would show
// the previous day for anyone west of UTC.
const shortDate = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
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

/** Local YYYY-MM-DDTHH:mm for <input type="datetime-local">. */
export function toDateTimeInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

/** Inverse of toDateTimeInput: the browser reads the value as local time. */
export function fromDateTimeInput(value) {
  return value ? new Date(value).toISOString() : null
}

export function isOverdue(iso) {
  if (!iso) return false
  const due = toDateInput(iso)
  if (!due) return false
  // Same UTC calendar rule the dashboard API uses.
  return due < new Date().toISOString().slice(0, 10)
}
