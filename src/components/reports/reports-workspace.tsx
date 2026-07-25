'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  FileText,
  Gavel,
  MapPin,
  Plus,
  Save,
  ScrollText,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useApi } from '@/hooks/use-api'
import { useFetch } from '@/hooks/use-fetch'
import { useToast } from '@/components/ui/toast'
import { ImageField } from '@/components/reports/image-field'
import {
  EMPTY_PERSON_DRAFT,
  PersonAvatar,
  PersonPicker,
  type PersonDraft,
  type PersonSummary,
} from '@/components/reports/person-picker'
import {
  OPEN_REPORT_STATUSES,
  REPORT_STATUSES,
  REPORT_STATUS_META,
  personDisplayName,
  type ReportAttachment,
  type ReportStatusValue,
} from '@/lib/reports'
import { cn, formatDateTime } from '@/lib/utils'

interface ReportUpdateRow {
  id: string
  status: ReportStatusValue | null
  note: string
  authorName: string | null
  createdAt: string
  author: { id: string; displayName: string } | null
}

export interface ReportRow {
  id: string
  caseNumber: string
  charge: string
  description?: string
  incidentAt: string | null
  location: string | null
  status: ReportStatusValue
  recordedByName: string | null
  createdAt: string
  updatedAt: string
  attachments?: ReportAttachment[]
  complainant: PersonSummary | null
  suspect: PersonSummary | null
  updates?: ReportUpdateRow[]
}

interface ReportsWorkspaceProps {
  canManage: boolean
  canDelete: boolean
  onOpenPerson: (personId: string) => void
}

type StatusFilter = 'ALL' | 'OPEN' | ReportStatusValue

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'OPEN', label: 'Offen' },
  { value: 'ALL', label: 'Alle' },
  ...REPORT_STATUSES.map((status) => ({
    value: status as StatusFilter,
    label: REPORT_STATUS_META[status].shortLabel,
  })),
]

const statusOptions = REPORT_STATUSES.map((status) => ({
  value: status,
  label: REPORT_STATUS_META[status].label,
}))

interface ReportForm {
  charge: string
  description: string
  incidentAt: string
  location: string
  complainant: PersonDraft
  suspect: PersonDraft
  attachments: ReportAttachment[]
}

const EMPTY_FORM: ReportForm = {
  charge: '',
  description: '',
  incidentAt: '',
  location: '',
  complainant: { ...EMPTY_PERSON_DRAFT },
  suspect: { ...EMPTY_PERSON_DRAFT },
  attachments: [],
}

function reportHaystack(report: ReportRow) {
  return [
    report.caseNumber,
    report.charge,
    report.location,
    personDisplayName(report.suspect),
    personDisplayName(report.complainant),
    report.suspect?.fileNumber,
    report.complainant?.fileNumber,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function ReportsWorkspace({ canManage, canDelete, onOpenPerson }: ReportsWorkspaceProps) {
  const { data: reports, loading, error: loadError, refetch } = useFetch<ReportRow[]>('/api/reports')
  const { data: people, refetch: refetchPeople } = useFetch<PersonSummary[]>('/api/person-files')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<ReportForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (reports ?? []).filter((report) => {
      const statusOk = statusFilter === 'ALL'
        ? true
        : statusFilter === 'OPEN'
          ? OPEN_REPORT_STATUSES.includes(report.status)
          : report.status === statusFilter
      return statusOk && (!query || reportHaystack(report).includes(query))
    })
  }, [reports, search, statusFilter])

  const activeId = filtered.find((report) => report.id === selectedId)?.id ?? filtered[0]?.id ?? null

  const stats = useMemo(() => {
    const list = reports ?? []
    return {
      total: list.length,
      open: list.filter((report) => OPEN_REPORT_STATUSES.includes(report.status)).length,
      court: list.filter((report) => report.status === 'IN_COURT').length,
      closed: list.filter((report) => report.status === 'CLOSED').length,
    }
  }, [reports])

  const submit = async () => {
    if (!form.charge.trim()) {
      addToast({ type: 'error', title: 'Tatvorwurf fehlt' })
      return
    }
    if (!form.description.trim()) {
      addToast({ type: 'error', title: 'Sachverhalt fehlt' })
      return
    }

    setSaving(true)
    try {
      const created = await execute('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          charge: form.charge,
          description: form.description,
          incidentAt: form.incidentAt || null,
          location: form.location,
          complainant: form.complainant,
          suspect: form.suspect,
          attachments: form.attachments,
        }),
      }) as ReportRow | null
      addToast({ type: 'success', title: 'Anzeige aufgenommen', message: created?.caseNumber })
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      if (created?.id) setSelectedId(created.id)
      await Promise.all([refetch(), refetchPeople()])
    } catch (e) {
      addToast({ type: 'error', title: 'Speichern fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Anzeigen"
        description="Anzeigen aufnehmen, Vorgänge verfolgen und Personenakten verknüpfen."
        action={canManage ? (
          <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true) }}>
            <Plus size={14} strokeWidth={2} />
            Anzeige aufnehmen
          </Button>
        ) : undefined}
      />

      {loadError && (
        <div className="rounded-[12px] border border-[#3b1616] bg-[#1c1111] px-4 py-3 text-[12.5px] text-[#fca5a5]">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Anzeigen gesamt" value={stats.total} />
        <StatCard label="Offene Vorgänge" value={stats.open} />
        <StatCard label="Bei Gericht" value={stats.court} />
        <StatCard label="Abgeschlossen" value={stats.closed} />
      </div>

      {(reports ?? []).length === 0 ? (
        <EmptyState
          title="Noch keine Anzeigen aufgenommen"
          hint={canManage ? 'Lege die erste Anzeige über „Anzeige aufnehmen“ an.' : 'Aufgenommene Anzeigen erscheinen hier.'}
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_1fr]">
          <aside className="overflow-hidden rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 lg:sticky lg:top-4">
            <div className="flex items-center justify-between border-b border-[#18385f]/45 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8ea4bd]">Vorgänge</p>
              <span className="text-[10.5px] text-[#536b86]">
                {filtered.length}
                {filtered.length !== (reports?.length ?? 0) && ` / ${reports?.length ?? 0}`}
              </span>
            </div>

            <div className="space-y-2 border-b border-[#18385f]/45 px-2.5 py-2.5">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4a6585]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Aktenzeichen, Name, Tatvorwurf"
                  className="h-[34px] w-full rounded-[8px] border border-[#18385f]/70 bg-[#0a1a33] pl-8 pr-3 text-[13px] text-[#edf4fb] outline-none transition-colors placeholder:text-[#4a6585] focus:border-[#d4af37]"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {filterOptions.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    active={statusFilter === option.value}
                    onClick={() => setStatusFilter(option.value)}
                  />
                ))}
              </div>
            </div>

            <div className="max-h-[min(680px,calc(100vh-280px))] min-h-[220px] overflow-y-auto p-1.5">
              {filtered.map((report) => (
                <ReportListItem
                  key={report.id}
                  report={report}
                  active={activeId === report.id}
                  onSelect={() => setSelectedId(report.id)}
                />
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-8 text-center text-[12px] text-[#6b8299]">
                  Kein Vorgang passt zu Suche und Filter.
                </p>
              )}
            </div>
          </aside>

          {activeId ? (
            <ReportDetail
              key={activeId}
              reportId={activeId}
              canManage={canManage}
              canDelete={canDelete}
              onOpenPerson={onOpenPerson}
              onChanged={() => void refetch()}
              onDeleted={() => { setSelectedId(null); void refetch() }}
            />
          ) : (
            <EmptyState title="Kein Vorgang ausgewählt" hint="Wähle links eine Anzeige aus." />
          )}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Anzeige aufnehmen"
        description="Alle Angaben landen in der Akte der beteiligten Personen."
        size="xl"
      >
        <div className="space-y-4">
          <Textarea
            label="Tatvorwurf"
            value={form.charge}
            onChange={(event) => setForm({ ...form, charge: event.target.value })}
            rows={2}
            placeholder="z. B. Körperverletzung, Diebstahl, Sachbeschädigung"
          />
          <Textarea
            label="Sachverhalt"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={5}
            placeholder="Was ist passiert? Wer war beteiligt? Zeugen?"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="incidentAt" className="block text-[12.5px] font-medium text-[#9fb0c4]">
                Tatzeitpunkt
              </label>
              <input
                id="incidentAt"
                type="datetime-local"
                value={form.incidentAt}
                onChange={(event) => setForm({ ...form, incidentAt: event.target.value })}
                className="h-[36px] w-full rounded-[9px] border border-[#18385f]/70 bg-[#0a1a33] px-3 text-[13.5px] text-[#edf4fb] outline-none transition-colors focus:border-[#d4af37]"
              />
            </div>
            <Input
              label="Tatort"
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              placeholder="z. B. Vespucci Beach"
            />
          </div>

          <PersonPicker
            title="Anzeigenerstatter (Antragsteller)"
            description="Wer stellt die Anzeige? Ausweisbild und Telefonnummer landen in seiner Akte."
            people={people ?? []}
            value={form.complainant}
            onChange={(value) => setForm({ ...form, complainant: value })}
          />

          <PersonPicker
            title="Angezeigter (Beschuldigter)"
            description="Gegen wen richtet sich die Anzeige? Bei jeder neuen Person entsteht automatisch eine Akte."
            people={people ?? []}
            value={form.suspect}
            onChange={(value) => setForm({ ...form, suspect: value })}
          />

          <AttachmentEditor
            attachments={form.attachments}
            onChange={(attachments) => setForm({ ...form, attachments })}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={submit} loading={saving}>
              <Save size={13} />
              Anzeige speichern
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function ReportDetail({
  reportId,
  canManage,
  canDelete,
  onOpenPerson,
  onChanged,
  onDeleted,
}: {
  reportId: string
  canManage: boolean
  canDelete: boolean
  onOpenPerson: (personId: string) => void
  onChanged: () => void
  onDeleted: () => void
}) {
  const { data: report, loading, refetch } = useFetch<ReportRow>(`/api/reports/${reportId}`)
  const { execute } = useApi()
  const { addToast } = useToast()
  const [status, setStatus] = useState<ReportStatusValue>('RECORDED')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (report) setStatus(report.status)
  }, [report?.id, report?.status])

  const addUpdate = async () => {
    if (!report) return
    setSaving(true)
    try {
      await execute(`/api/reports/${report.id}/updates`, {
        method: 'POST',
        body: JSON.stringify({ status, note }),
      })
      addToast({ type: 'success', title: 'Vermerk gespeichert' })
      setNote('')
      await refetch()
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: 'Speichern fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!report || !confirm(`Anzeige ${report.caseNumber} wirklich löschen?`)) return
    setSaving(true)
    try {
      await execute(`/api/reports/${report.id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Anzeige gelöscht' })
      onDeleted()
    } catch (e) {
      addToast({ type: 'error', title: 'Löschen fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !report) return <EmptyState title="Vorgang wird geladen…" hint="" />

  const meta = REPORT_STATUS_META[report.status]
  const attachments = report.attachments ?? []

  return (
    <section className="space-y-4">
      <div className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-[6px] border border-[#d4af37]/30 bg-[#d4af37]/10 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold tracking-wide text-[#d4af37]">
            {report.caseNumber}
          </span>
          <Badge variant={meta.variant}>{meta.label}</Badge>
          <span className="text-[11.5px] text-[#6b8299]">Aktualisiert {formatDateTime(report.updatedAt)}</span>
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              className="ml-auto inline-flex items-center gap-1 rounded-[7px] border border-[#7f1d1d]/50 px-2 py-1 text-[11.5px] font-medium text-[#fca5a5] transition-colors hover:bg-[#2a1620]/60"
            >
              <Trash2 size={11} />
              Löschen
            </button>
          )}
        </div>

        <h2 className="mt-3 whitespace-pre-wrap text-[17px] font-semibold leading-6 text-white">{report.charge}</h2>

        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <MetaItem icon={CalendarClock} label="Tatzeit" value={report.incidentAt ? formatDateTime(report.incidentAt) : '—'} />
          <MetaItem icon={MapPin} label="Tatort" value={report.location || '—'} />
          <MetaItem icon={UserRound} label="Aufgenommen von" value={report.recordedByName || '—'} />
        </dl>
      </div>

      <div className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 p-4">
        <SectionTitle icon={FileText} title="Sachverhalt" />
        <p className="whitespace-pre-wrap text-[13px] leading-6 text-[#dbe6f3]">{report.description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PersonCard
          title="Anzeigenerstatter"
          person={report.complainant}
          onOpen={onOpenPerson}
          showIdCard
        />
        <PersonCard
          title="Angezeigter"
          person={report.suspect}
          onOpen={onOpenPerson}
        />
      </div>

      {attachments.length > 0 && (
        <div className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 p-4">
          <SectionTitle icon={FileText} title="Beweisbilder" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-[10px] border border-[#18385f]/60 bg-[#071a30]/55"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.url} alt={attachment.label} className="h-28 w-full object-cover" />
                <p className="truncate px-2 py-1.5 text-[11.5px] text-[#8ea4bd]">{attachment.label}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {canManage && (
        <div className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 p-4">
          <SectionTitle icon={Gavel} title="Status & Vermerk" />
          <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
            <Select
              label="Status"
              value={status}
              onValueChange={(value) => setStatus(value as ReportStatusValue)}
              options={statusOptions}
              disabled={saving}
            />
            <Textarea
              label="Vermerk"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Was ist im Vorgang passiert?"
              disabled={saving}
            />
          </div>
          <p className="mt-2 text-[11.5px] text-[#6b8299]">{REPORT_STATUS_META[status].description}</p>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={addUpdate} loading={saving}>
              <Save size={13} />
              Eintragen
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 p-4">
        <SectionTitle icon={ScrollText} title="Verlauf" />
        <div className="space-y-2">
          {(report.updates ?? []).map((update) => (
            <div key={update.id} className="rounded-[10px] border border-[#18385f]/45 bg-[#071a30]/55 p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {update.status && (
                  <Badge variant={REPORT_STATUS_META[update.status].variant}>
                    {REPORT_STATUS_META[update.status].shortLabel}
                  </Badge>
                )}
                <span className="text-[11.5px] text-[#8ea4bd]">
                  {update.author?.displayName || update.authorName || 'System'}
                </span>
                <span className="text-[11px] text-[#536b86]">{formatDateTime(update.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-[12.5px] leading-5 text-[#dbe6f3]">{update.note}</p>
            </div>
          ))}
          {(report.updates ?? []).length === 0 && (
            <p className="py-4 text-center text-[12px] text-[#6b8299]">Noch keine Einträge.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function PersonCard({
  title,
  person,
  onOpen,
  showIdCard,
}: {
  title: string
  person: PersonSummary | null
  onOpen: (personId: string) => void
  showIdCard?: boolean
}) {
  return (
    <div className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8ea4bd]">{title}</p>

      {person ? (
        <>
          <div className="flex items-start gap-3">
            <PersonAvatar person={person} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] font-semibold text-[#d4af37]">{person.fileNumber}</p>
              <p className="truncate text-[15px] font-semibold text-white">{personDisplayName(person) || '—'}</p>
              <p className="mt-0.5 truncate text-[12px] text-[#8ea4bd]">{person.phone || 'Keine Telefonnummer'}</p>
              {person.wanted && <Badge variant="danger" className="mt-1.5">Zur Fahndung ausgeschrieben</Badge>}
            </div>
          </div>

          {showIdCard && person.idCardImageUrl && (
            <a
              href={person.idCardImageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block overflow-hidden rounded-[10px] border border-[#18385f]/60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={person.idCardImageUrl} alt="Personalausweis" className="h-32 w-full object-cover" />
            </a>
          )}

          <Button variant="secondary" size="sm" className="mt-3" onClick={() => onOpen(person.id)}>
            Akte öffnen
          </Button>
        </>
      ) : (
        <p className="py-3 text-[12.5px] text-[#6b8299]">Keine Person hinterlegt.</p>
      )}
    </div>
  )
}

function AttachmentEditor({
  attachments,
  onChange,
}: {
  attachments: ReportAttachment[]
  onChange: (attachments: ReportAttachment[]) => void
}) {
  const add = (url: string) => {
    if (!url) return
    onChange([
      ...attachments,
      { id: `bild_${attachments.length + 1}_${Date.now()}`, url, label: `Beweisbild ${attachments.length + 1}` },
    ])
  }

  return (
    <section className="rounded-[12px] border border-[#18385f]/55 bg-[#0a1a33]/40 p-3.5">
      <p className="text-[13px] font-semibold text-white">Beweisbilder</p>
      <p className="mt-0.5 text-[11.5px] text-[#6b8299]">Optionale Fotos zum Vorgang (max. 12).</p>

      {attachments.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {attachments.map((attachment, index) => (
            <div key={attachment.id} className="overflow-hidden rounded-[9px] border border-[#18385f]/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.url} alt={attachment.label} className="h-20 w-full object-cover" />
              <input
                value={attachment.label}
                onChange={(event) => onChange(attachments.map((item, itemIndex) => (
                  itemIndex === index ? { ...item, label: event.target.value } : item
                )))}
                className="w-full bg-[#071a30]/70 px-2 py-1 text-[11px] text-[#dbe6f3] outline-none"
              />
              <button
                type="button"
                onClick={() => onChange(attachments.filter((_, itemIndex) => itemIndex !== index))}
                className="w-full bg-[#2a1620]/60 py-1 text-[11px] font-medium text-[#fca5a5]"
              >
                Entfernen
              </button>
            </div>
          ))}
        </div>
      )}

      {attachments.length < 12 && (
        <ImageField
          label=""
          description="Weiteres Bild hinzufügen"
          value=""
          onChange={add}
          className="mt-3"
        />
      )}
    </section>
  )
}

function ReportListItem({
  report,
  active,
  onSelect,
}: {
  report: ReportRow
  active: boolean
  onSelect: () => void
}) {
  const meta = REPORT_STATUS_META[report.status]

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-[9px] border px-3 py-2.5 text-left transition-colors',
        active ? 'border-[#d4af37]/35 bg-[#d4af37]/12' : 'border-transparent hover:bg-[#102542]/60',
      )}
    >
      <div className="flex items-start gap-2.5">
        <PersonAvatar person={report.suspect} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[10.5px] font-semibold tracking-wide text-[#d4af37]">
            {report.caseNumber}
          </p>
          <p className="truncate text-[13px] font-semibold text-white">
            {personDisplayName(report.suspect) || 'Unbekannte Person'}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-[#8ea4bd]">{report.charge}</p>
          <p className="mt-0.5 truncate text-[11px] text-[#536b86]">{formatDateTime(report.createdAt)}</p>
        </div>
        <Badge variant={meta.variant}>{meta.shortLabel}</Badge>
      </div>
    </button>
  )
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock
  label: string
  value: string
}) {
  return (
    <div className="rounded-[10px] border border-[#18385f]/45 bg-[#071a30]/55 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#4a6585]">
        <Icon size={12} className="text-[#d4af37]" />
        {label}
      </div>
      <p className="mt-1 truncate text-[12.5px] text-[#dbe6f3]">{value}</p>
    </div>
  )
}

export function SectionTitle({ icon: Icon, title }: { icon: typeof FileText; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon size={15} className="text-[#d4af37]" />
      <h3 className="text-[14px] font-semibold text-white">{title}</h3>
    </div>
  )
}

export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] border border-white/[0.04] bg-[#091e36]/70 px-4 py-3">
      <p className="text-[20px] font-semibold leading-tight text-white tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-[#8ea4bd]">{label}</p>
    </div>
  )
}

export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-[7px] border px-2 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-[#d4af37]/45 bg-[#d4af37]/14 text-[#d4af37]'
          : 'border-[#18385f]/60 bg-[#0a1a33]/55 text-[#8ea4bd] hover:border-[#234568] hover:text-white',
      )}
    >
      {label}
    </button>
  )
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <section className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/70 py-14 text-center">
      <ScrollText size={28} className="mx-auto mb-3 text-[#4a6585]" />
      <p className="text-[14px] font-semibold text-white">{title}</p>
      {hint && <p className="mt-1 text-[12.5px] text-[#8ea4bd]">{hint}</p>}
    </section>
  )
}
