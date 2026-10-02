import { useState } from 'react'
import { useAuth } from './AuthContext'
import { api } from '../../shared/api/client'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Select } from '../../shared/ui/Select'
import { notify } from '../../shared/ui/notify'
import { PageHeader } from '../../shared/ui/PageState'

const TIMEZONES =
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['UTC', 'Europe/Berlin', 'America/New_York', 'Africa/Cairo']

export function ProfilePage() {
  const { user, setUser } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const data = await api.patch('/users/me', {
        name: name.trim(),
        timezone,
      })
      setUser(data.user)
      notify.success('Profile saved.')
    } catch (error) {
      notify.apiError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        description="This is how teammates see you across Grasyn."
      />
      <form
        onSubmit={handleSubmit}
        className="mt-8 max-w-md space-y-4 rounded-xl border border-border bg-surface p-4"
      >
        <Input label="Email" value={user?.email ?? ''} disabled />
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Select
          label="Timezone"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
        >
          {TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
        <Button type="submit" loading={saving}>
          Save profile
        </Button>
      </form>
    </div>
  )
}
