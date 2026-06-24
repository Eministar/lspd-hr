'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Megaphone, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { cn, formatDateTime } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'

interface Officer {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string
}

interface CalendarEvent {
  id: string
  module: string | null
  title: string
  description: string | null
  type: string
  startsAt: string
  endsAt: string | null
  location: string | null
  discordAnnouncement: boolean
  officer: Officer | null
  createdBy: { displayName: string } | null
}

const eventTypes = [
  { value: 'TRAINING', label: 'Training' },
  { value: 'MEETING', label: 'Besprechung' },
  { value: 'ACADEMY', label: 'Recruitment & Training' },
  { value: 'EXAM', label: 'Prüfung' },
  { value: 'HR_DEADLINE', label: 'HR-Frist' },
  { value: 'OTHER', label: 'Sonstiges' },
]

const moduleMeta: Record<string, { label: string; color: string }> = {
  ACADEMY: { label: 'Recruitment & Training', color: '#d4af37' },
  HR: { label: 'HR', color: '#7c3aed' },
  SRU: { label: 'S.W.U.', color: '#dc2626' },
  INTERNAL_AFFAIRS: { label: 'Internal Affairs', color: '#0ea5e9' },
  AIR_SUPPORT: { label: 'Air-Support Division', color: '#38bdf8' },
}

function localDateTimeValue(days = 0) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setMinutes(0, 0, 0)
  return date.toISOString().slice(0, 16)
}

export default function CalendarPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'calendar:view')
  const canManage = hasPermission(user, 'calendar:manage')
  const { execute } = useApi()
  const { addToast } = useToast()
  const { data: events, loading, refetch } = useFetch<CalendarEvent[]>(canView ? '/api/calendar-events' : null)
  const { data: officers } = useFetch<Officer[]>(canManage ? '/api/officers' : null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'TRAINING',
    startsAt: localDateTimeValue(),
    endsAt: '',
    location: '',
    officerId: '',
    discordAnnouncement: false,
  })

  const officerOptions = useMemo(() => [
    { value: '', label: 'Kein Officer-Bezug' },
    ...(officers ?? []).map((officer) => ({
      value: officer.id,
      label: `${officer.firstName} ${officer.lastName} #${displayBadgeNumber(officer.badgeNumber)}`,
    })),
  ], [officers])

  const createEvent = async () => {
    if (!form.title.trim() || !form.startsAt) return
    try {
      await execute('/api/calendar-events', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          description: form.description.trim() || null,
          endsAt: form.endsAt || null,
          location: form.location.trim() || null,
          officerId: form.officerId || null,
        }),
      })
      addToast({ type: 'success', title: 'Termin erstellt' })
      setModalOpen(false)
      setForm({ title: '', description: '', type: 'TRAINING', startsAt: localDateTimeValue(), endsAt: '', location: '', officerId: '', discordAnnouncement: false })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Termin konnte nicht erstellt werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const deleteEvent = async (id: string) => {
    try {
      await execute(`/api/calendar-events/${id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Termin gelöscht' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Termin konnte nicht gelöscht werden', message: err instanceof Error ? err.message : '' })
    }
  }

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader
        title="Kalender"
        description="Trainings, Besprechungen, Recruitment-&-Training-Termine, Prüfungen und HR-Fristen"
        action={(
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={refetch}><RefreshCw size={13} /> Aktualisieren</Button>
            {canManage && <Button size="sm" onClick={() => setModalOpen(true)}><Plus size={13} /> Termin</Button>}
          </div>
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {(events ?? []).map((event) => (
          <div
            key={event.id}
            className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 p-4"
            style={{
              borderLeftWidth: 4,
              borderLeftColor: moduleMeta[event.module ?? '']?.color ?? '#d4af37',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[6px] border border-[#d4af37]/20 bg-[#d4af37]/8 px-2 py-0.5 text-[11px] font-semibold text-[#d4af37]">{event.type}</span>
                  {event.module && (
                    <span
                      className="rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        borderColor: `${moduleMeta[event.module]?.color ?? '#d4af37'}40`,
                        backgroundColor: `${moduleMeta[event.module]?.color ?? '#d4af37'}14`,
                        color: moduleMeta[event.module]?.color ?? '#d4af37',
                      }}
                    >
                      {moduleMeta[event.module]?.label ?? event.module}
                    </span>
                  )}
                  {event.discordAnnouncement && <Megaphone size={13} className="text-[#38bdf8]" />}
                </div>
                <h3 className="mt-2 text-[14px] font-semibold text-white">{event.title}</h3>
                <p className="mt-1 text-[12px] text-[#8ea4bd]">{formatDateTime(event.startsAt)}{event.endsAt ? ` → ${formatDateTime(event.endsAt)}` : ''}</p>
              </div>
              {canManage && (
                <button type="button" onClick={() => deleteEvent(event.id)} className="rounded-[7px] p-1.5 text-[#6b8299] transition-colors hover:bg-[#321218]/60 hover:text-[#fca5a5]">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {event.location && <p className="mt-3 text-[12.5px] text-[#c7d4e4]">Ort: {event.location}</p>}
            {event.description && <p className="mt-2 text-[12.5px] leading-relaxed text-[#b7c5d8]">{event.description}</p>}
            {event.officer && (
              <Link href={`/officers/${event.officer.id}`} className="mt-3 inline-flex text-[12px] text-[#d4af37] hover:text-white">
                {event.officer.firstName} {event.officer.lastName} #{displayBadgeNumber(event.officer.badgeNumber)}
              </Link>
            )}
          </div>
        ))}
      </div>

      {(events ?? []).length === 0 && (
        <div className="glass-panel-elevated rounded-[14px] p-12 text-center">
          <CalendarDays size={28} className="mx-auto mb-3 text-[#d4af37]/35" />
          <p className="text-[13px] text-[#8ea4bd]">Keine Termine vorhanden</p>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Termin erstellen">
        <div className="space-y-4">
          <Input label="Titel" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Select label="Art" value={form.type} onValueChange={(type) => setForm({ ...form, type })} options={eventTypes} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            <Input label="Ende optional" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </div>
          <Input label="Ort optional" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Select label="Officer-Bezug" value={form.officerId} onValueChange={(officerId) => setForm({ ...form, officerId })} options={officerOptions} />
          <Textarea label="Beschreibung" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          <label className={cn('flex items-center gap-2 rounded-[9px] border border-[#18385f]/60 bg-[#0a1a33] px-3 py-2 text-[12.5px] text-[#b7c5d8]')}>
            <input type="checkbox" checked={form.discordAnnouncement} onChange={(e) => setForm({ ...form, discordAnnouncement: e.target.checked })} />
            Discord-Ankündigung senden
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={createEvent} disabled={!form.title.trim() || !form.startsAt}>Erstellen</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
