'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/layout/page-header'
import { UnitMultiSelect } from '@/components/officers/unit-multi-select'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'

interface Rank {
  id: string
  name: string
  sortOrder: number
}

interface Unit {
  id: string
  key: string
  name: string
}

export default function NewOfficerPage() {
  const router = useRouter()
  const { addToast } = useToast()
  const { data: ranks } = useFetch<Rank[]>('/api/ranks')
  const { data: units } = useFetch<Unit[]>('/api/units?active=true')
  const { execute, loading } = useApi()
  const { user } = useAuth()
  const canCreate = hasPermission(user, 'officers:write')

  const [form, setForm] = useState({
    badgeNumber: '',
    firstName: '',
    lastName: '',
    rankId: '',
    discordId: '',
    notes: '',
    units: [] as string[],
    hireDate: new Date().toISOString().split('T')[0],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = { ...form, discordId: form.discordId.trim() || null }
      await execute('/api/officers', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      addToast({ type: 'success', title: 'Officer erstellt' })
      router.push('/officers')
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    }
  }

  const update = (key: string, value: string | string[]) => setForm(prev => ({ ...prev, [key]: value }))

  if (!canCreate) return <UnauthorizedContent />

  return (
    <div>
      <PageHeader
        title="Neuer Officer"
        description="Neuen Mitarbeiter anlegen"
        action={
          <Link href="/officers">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={15} strokeWidth={1.75} />
              Zurück
            </Button>
          </Link>
        }
      />

      <div className="glass-panel-elevated rounded-[14px] p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="firstName"
              label="Vorname"
              value={form.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              required
            />
            <Input
              id="lastName"
              label="Nachname"
              value={form.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="badgeNumber"
              label="Dienstnummer"
              value={form.badgeNumber}
              onChange={(e) => update('badgeNumber', e.target.value)}
              placeholder="Automatisch nach Rang"
            />
            <Select
              id="rankId"
              label="Rang"
              value={form.rankId}
              onChange={(e) => update('rankId', e.target.value)}
              options={ranks?.map(r => ({ value: r.id, label: r.name })) || []}
              placeholder="Rang auswählen"
              required
            />
          </div>

          <div className="max-w-xl">
            <Input
              id="discordId"
              label="Discord-ID"
              value={form.discordId}
              onChange={(e) => update('discordId', e.target.value)}
              placeholder="Optional (Snowflake)"
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DateField
              id="hireDate"
              label="Einstellungsdatum"
              value={form.hireDate}
              onChange={(v) => update('hireDate', v)}
            />
            <UnitMultiSelect value={form.units} units={units ?? undefined} onChange={(value) => update('units', value)} />
          </div>

          <Textarea
            id="notes"
            label="Notizen"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            placeholder="Optional"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Link href="/officers">
              <Button type="button" variant="secondary" size="sm">Abbrechen</Button>
            </Link>
            <Button type="submit" size="sm" loading={loading}>
              Officer erstellen
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
