'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { IdCard, Phone, Plus, Save, ScrollText, Search, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/components/ui/date-field'
import { useApi } from '@/hooks/use-api'
import { useFetch } from '@/hooks/use-fetch'
import { useToast } from '@/components/ui/toast'
import { ImageField } from '@/components/reports/image-field'
import { PersonAvatar, type PersonSummary } from '@/components/reports/person-picker'
import { EmptyState, FilterChip, SectionTitle, StatCard } from '@/components/reports/reports-workspace'
import type { ReportRow } from '@/components/reports/reports-workspace'
import { REPORT_STATUS_META, personDisplayName } from '@/lib/reports'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

interface PersonFileDetail extends PersonSummary {
  birthDate: string | null
  address: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  createdBy: { id: string; displayName: string } | null
  reportsAsSuspect: ReportRow[]
  reportsAsComplainant: ReportRow[]
}

interface PersonFilesWorkspaceProps {
  canManage: boolean
  canDelete: boolean
  selectedId: string | null
  onSelect: (personId: string | null) => void
}

interface PersonForm {
  firstName: string
  lastName: string
  birthDate: string
  phone: string
  address: string
  idCardImageUrl: string
  photoUrl: string
  notes: string
  wanted: boolean
}

const EMPTY_FORM: PersonForm = {
  firstName: '',
  lastName: '',
  birthDate: '',
  phone: '',
  address: '',
  idCardImageUrl: '',
  photoUrl: '',
  notes: '',
  wanted: false,
}

export function PersonFilesWorkspace({ canManage, canDelete, selectedId, onSelect }: PersonFilesWorkspaceProps) {
  const { data: people, loading, error: loadError, refetch } = useFetch<PersonSummary[]>('/api/person-files')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [search, setSearch] = useState('')
  const [wantedOnly, setWantedOnly] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<PersonForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (people ?? []).filter((person) => {
      if (wantedOnly && !person.wanted) return false
      if (!query) return true
      return `${person.fileNumber} ${personDisplayName(person)} ${person.phone ?? ''}`
        .toLowerCase()
        .includes(query)
    })
  }, [people, search, wantedOnly])

  const activeId = filtered.find((person) => person.id === selectedId)?.id ?? filtered[0]?.id ?? null

  const stats = useMemo(() => {
    const list = people ?? []
    return {
      total: list.length,
      wanted: list.filter((person) => person.wanted).length,
    }
  }, [people])

  const createPerson = async () => {
    if (!form.firstName.trim() && !form.lastName.trim()) {
      addToast({ type: 'error', title: 'Name fehlt' })
      return
    }
    setSaving(true)
    try {
      const created = await execute('/api/person-files', {
        method: 'POST',
        body: JSON.stringify(form),
      }) as PersonSummary | null
      addToast({ type: 'success', title: 'Akte angelegt', message: created?.fileNumber })
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      if (created?.id) onSelect(created.id)
      await refetch()
    } catch (e) {
      addToast({ type: 'error', title: 'Anlegen fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Personenakten"
        description="Stammdaten, Bilder und alle Vorgänge zu einer Person an einem Ort."
        action={canManage ? (
          <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true) }}>
            <Plus size={14} strokeWidth={2} />
            Akte anlegen
          </Button>
        ) : undefined}
      />

      {loadError && (
        <div className="rounded-[12px] border border-[#3b1616] bg-[#1c1111] px-4 py-3 text-[12.5px] text-[#fca5a5]">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Akten gesamt" value={stats.total} />
        <StatCard label="Zur Fahndung" value={stats.wanted} />
      </div>

      {(people ?? []).length === 0 ? (
        <EmptyState
          title="Noch keine Personenakten"
          hint="Akten entstehen automatisch, sobald eine Anzeige aufgenommen wird."
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="overflow-hidden rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 lg:sticky lg:top-4">
            <div className="flex items-center justify-between border-b border-[#18385f]/45 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8ea4bd]">Akten</p>
              <span className="text-[10.5px] text-[#536b86]">{filtered.length}</span>
            </div>

            <div className="space-y-2 border-b border-[#18385f]/45 px-2.5 py-2.5">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4a6585]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, PA-Nummer oder Telefon"
                  className="h-[34px] w-full rounded-[8px] border border-[#18385f]/70 bg-[#0a1a33] pl-8 pr-3 text-[13px] text-[#edf4fb] outline-none transition-colors placeholder:text-[#4a6585] focus:border-[#d4af37]"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                <FilterChip label="Alle" active={!wantedOnly} onClick={() => setWantedOnly(false)} />
                <FilterChip label="Fahndung" active={wantedOnly} onClick={() => setWantedOnly(true)} />
              </div>
            </div>

            <div className="max-h-[min(680px,calc(100vh-280px))] min-h-[220px] overflow-y-auto p-1.5">
              {filtered.map((person) => (
                <Link
                  key={person.id}
                  href={`/anzeigen/akten/${person.id}`}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-[9px] border px-3 py-2.5 text-left transition-colors',
                    activeId === person.id
                      ? 'border-[#d4af37]/35 bg-[#d4af37]/12'
                      : 'border-transparent hover:bg-[#102542]/60',
                  )}
                >
                  <PersonAvatar person={person} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[10.5px] font-semibold text-[#d4af37]">{person.fileNumber}</p>
                    <p className="truncate text-[13px] font-semibold text-white">{personDisplayName(person) || '—'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[#6b8299]">{person.phone || 'Keine Telefonnummer'}</p>
                  </div>
                  {person.wanted && <Badge variant="danger">Fahndung</Badge>}
                </Link>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-8 text-center text-[12px] text-[#6b8299]">Keine Akte gefunden.</p>
              )}
            </div>
          </aside>

          {activeId ? (
            <PersonFileDetailView
              key={activeId}
              personId={activeId}
              canManage={canManage}
              canDelete={canDelete}
              onChanged={() => void refetch()}
              onDeleted={() => { onSelect(null); void refetch() }}
            />
          ) : (
            <EmptyState title="Keine Akte ausgewählt" hint="Wähle links eine Person aus." />
          )}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Personenakte anlegen"
        description="Für Personen, die noch nicht über eine Anzeige erfasst wurden."
        size="xl"
      >
        <PersonFormFields form={form} onChange={setForm} disabled={saving} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
          <Button size="sm" onClick={createPerson} loading={saving}>
            <Save size={13} />
            Akte anlegen
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export function PersonFileDetailView({
  personId,
  canManage,
  canDelete,
  onChanged,
  onDeleted,
}: {
  personId: string
  canManage: boolean
  canDelete: boolean
  onChanged: () => void
  onDeleted: () => void
}) {
  const { data: person, loading, error, refetch } = useFetch<PersonFileDetail>(`/api/person-files/${personId}`)
  const { execute } = useApi()
  const { addToast } = useToast()
  const [form, setForm] = useState<PersonForm>(EMPTY_FORM)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!person) return
    setForm({
      firstName: person.firstName,
      lastName: person.lastName,
      birthDate: person.birthDate ? person.birthDate.slice(0, 10) : '',
      phone: person.phone ?? '',
      address: person.address ?? '',
      idCardImageUrl: person.idCardImageUrl ?? '',
      photoUrl: person.photoUrl ?? '',
      notes: person.notes ?? '',
      wanted: person.wanted,
    })
  }, [person])

  const save = async () => {
    if (!person) return
    setSaving(true)
    try {
      await execute(`/api/person-files/${person.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      })
      addToast({ type: 'success', title: 'Akte gespeichert' })
      setEditing(false)
      await refetch()
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: 'Speichern fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!person || !confirm(`Akte ${person.fileNumber} wirklich löschen? Die Anzeigen bleiben erhalten.`)) return
    setSaving(true)
    try {
      await execute(`/api/person-files/${person.id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Akte gelöscht' })
      onDeleted()
    } catch (e) {
      addToast({ type: 'error', title: 'Löschen fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <EmptyState title="Akte wird geladen…" hint="" />
  if (error || !person) return <EmptyState title="Personenakte nicht gefunden" hint={error || 'Die Akte ist nicht mehr vorhanden.'} />

  return (
    <section className="space-y-4">
      <div className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 p-4">
        <div className="flex flex-wrap items-start gap-4">
          <PersonAvatar person={person} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[6px] border border-[#d4af37]/30 bg-[#d4af37]/10 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-[#d4af37]">
                {person.fileNumber}
              </span>
              {person.wanted && <Badge variant="danger">Zur Fahndung ausgeschrieben</Badge>}
            </div>
            <h2 className="mt-2 text-[19px] font-semibold text-white">{personDisplayName(person) || '—'}</h2>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-[#8ea4bd]">
              <span className="inline-flex items-center gap-1.5">
                <Phone size={12} className="text-[#d4af37]" />
                {person.phone || '—'}
              </span>
              <span>Geboren: {person.birthDate ? formatDate(person.birthDate) : '—'}</span>
              <span>Anschrift: {person.address || '—'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {canManage && (
              <Button variant={editing ? 'secondary' : 'outline'} size="sm" onClick={() => setEditing(!editing)}>
                {editing ? 'Bearbeiten beenden' : 'Akte bearbeiten'}
              </Button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={remove}
                className="inline-flex items-center justify-center gap-1 rounded-[7px] border border-[#7f1d1d]/50 px-2 py-1 text-[11.5px] font-medium text-[#fca5a5] transition-colors hover:bg-[#2a1620]/60"
              >
                <Trash2 size={11} />
                Löschen
              </button>
            )}
          </div>
        </div>

        {(person.idCardImageUrl || person.photoUrl) && !editing && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {person.idCardImageUrl && (
              <ImagePreview label="Personalausweis" url={person.idCardImageUrl} />
            )}
            {person.photoUrl && <ImagePreview label="Lichtbild" url={person.photoUrl} />}
          </div>
        )}

        {person.notes && !editing && (
          <div className="mt-4 rounded-[10px] border border-[#18385f]/45 bg-[#071a30]/55 p-3">
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#4a6585]">Vermerke</p>
            <p className="whitespace-pre-wrap text-[12.5px] leading-5 text-[#dbe6f3]">{person.notes}</p>
          </div>
        )}
      </div>

      {editing && canManage && (
        <div className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 p-4">
          <SectionTitle icon={IdCard} title="Stammdaten bearbeiten" />
          <PersonFormFields form={form} onChange={setForm} disabled={saving} />
          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={save} loading={saving}>
              <Save size={13} />
              Speichern
            </Button>
          </div>
        </div>
      )}

      <ReportTable
        title="Anzeigen gegen diese Person"
        reports={person.reportsAsSuspect}
        emptyHint="Gegen diese Person liegt keine Anzeige vor."
      />
      <ReportTable
        title="Von dieser Person gestellte Anzeigen"
        reports={person.reportsAsComplainant}
        emptyHint="Diese Person hat keine Anzeige gestellt."
      />
    </section>
  )
}

function ReportTable({
  title,
  reports,
  emptyHint,
}: {
  title: string
  reports: ReportRow[]
  emptyHint: string
}) {
  return (
    <div className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 p-4">
      <SectionTitle icon={ScrollText} title={`${title} (${reports.length})`} />
      {reports.length === 0 ? (
        <p className="py-3 text-[12.5px] text-[#6b8299]">{emptyHint}</p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => {
            const meta = REPORT_STATUS_META[report.status]
            return (
              <Link
                key={report.id}
                href={`/anzeigen/${report.id}`}
                className="block rounded-[10px] border border-[#18385f]/45 bg-[#071a30]/55 p-3 transition-colors hover:border-[#d4af37]/30 hover:bg-[#102542]/60"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-[#d4af37]">{report.caseNumber}</span>
                  <Badge variant={meta.variant}>{meta.shortLabel}</Badge>
                  <span className="text-[11px] text-[#536b86]">{formatDateTime(report.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-[12.5px] leading-5 text-[#dbe6f3]">{report.charge}</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ImagePreview({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-[10px] border border-[#18385f]/60 bg-[#071a30]/55"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-36 w-full object-cover" />
      <p className="px-2 py-1.5 text-[11.5px] text-[#8ea4bd]">{label}</p>
    </a>
  )
}

function PersonFormFields({
  form,
  onChange,
  disabled,
}: {
  form: PersonForm
  onChange: (form: PersonForm) => void
  disabled: boolean
}) {
  const update = (patch: Partial<PersonForm>) => onChange({ ...form, ...patch })

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Vorname"
          value={form.firstName}
          onChange={(event) => update({ firstName: event.target.value })}
          disabled={disabled}
        />
        <Input
          label="Nachname"
          value={form.lastName}
          onChange={(event) => update({ lastName: event.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DateField
          label="Geburtsdatum"
          value={form.birthDate}
          onChange={(value) => update({ birthDate: value })}
        />
        <Input
          label="Telefonnummer"
          value={form.phone}
          onChange={(event) => update({ phone: event.target.value })}
          disabled={disabled}
        />
      </div>

      <Input
        label="Anschrift"
        value={form.address}
        onChange={(event) => update({ address: event.target.value })}
        disabled={disabled}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <ImageField
          label="Bild des Personalausweises"
          value={form.idCardImageUrl}
          onChange={(url) => update({ idCardImageUrl: url })}
          disabled={disabled}
        />
        <ImageField
          label="Lichtbild"
          value={form.photoUrl}
          onChange={(url) => update({ photoUrl: url })}
          disabled={disabled}
        />
      </div>

      <Textarea
        label="Vermerke"
        value={form.notes}
        onChange={(event) => update({ notes: event.target.value })}
        rows={3}
        disabled={disabled}
      />

      <Checkbox
        checked={form.wanted}
        onCheckedChange={(checked) => update({ wanted: checked })}
        label="Zur Fahndung ausgeschrieben"
        className="rounded-[10px] border border-[#18385f]/60 bg-[#0a1a33]/45 px-3 py-2.5"
      />
    </div>
  )
}
