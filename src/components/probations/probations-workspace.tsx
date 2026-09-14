'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRightLeft,
  CheckCircle2,
  ClipboardCheck,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'
import {
  PROBATION_ENTRY_RATING_LABELS,
  PROBATION_STATUS_LABELS,
  PROBATION_TYPE_LABELS,
  PROBATION_TYPES,
  type ProbationEntryRatingValue,
  type ProbationStatusValue,
  type ProbationTypeValue,
} from '@/lib/probations'

interface Officer {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string
  status: string
  rank: { name: string }
}

interface ChecklistItem {
  id: string
  label: string
  completed: boolean
}

interface ProbationEntry {
  id: string
  rating: ProbationEntryRatingValue
  comment: string
  createdAt: string
  createdBy: { displayName: string } | null
}

interface Probation {
  id: string
  type: ProbationTypeValue
  startsAt: string
  endsAt: string
  status: ProbationStatusValue
  checklist: ChecklistItem[] | null
  resultNote: string | null
  officer: Officer
  entries: ProbationEntry[]
  createdBy: { displayName: string } | null
  decidedBy: { displayName: string } | null
}

interface ProbationsWorkspaceProps {
  embedded?: boolean
}

function dateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateAfterDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return dateInputValue(date)
}

function statusClass(status: ProbationStatusValue) {
  if (status === 'PASSED') return 'border-green/18 bg-green/8 text-green'
  if (status === 'FAILED') return 'border-red/18 bg-red/8 text-red'
  if (status === 'EXTENDED') return 'border-orange/36 bg-gold/8 text-yellow'
  return 'border-line bg-surface text-blue'
}

function ratingClass(rating: ProbationEntryRatingValue) {
  return rating === 'POSITIVE'
    ? 'border-green/15 bg-green/8 text-green'
    : 'border-red/17 bg-red/8 text-red'
}

function entryStats(entries: ProbationEntry[]) {
  const positive = entries.filter((entry) => entry.rating === 'POSITIVE').length
  const negative = entries.filter((entry) => entry.rating === 'NEGATIVE').length
  const total = positive + negative
  return {
    positive,
    negative,
    total,
    positiveRate: total > 0 ? Math.round((positive / total) * 100) : 0,
  }
}

const typeOptions = PROBATION_TYPES.map((type) => ({
  value: type,
  label: PROBATION_TYPE_LABELS[type],
}))

export function ProbationsWorkspace({ embedded = false }: ProbationsWorkspaceProps) {
  const { user } = useAuth()
  const canView = hasPermission(user, 'probations:view')
  const canManage = hasPermission(user, 'probations:manage')
  const { data: probations, loading, refetch, setData: setProbations } = useFetch<Probation[]>(canView ? '/api/probations' : null)
  const { data: officers } = useFetch<Officer[]>(canManage ? '/api/officers' : null)
  const { execute } = useApi()
  const { addToast } = useToast()

  const [activeType, setActiveType] = useState<ProbationTypeValue>('ROOKIE')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [resultModal, setResultModal] = useState<Probation | null>(null)
  const [deleteModal, setDeleteModal] = useState<Probation | null>(null)
  const [form, setForm] = useState({
    officerId: '',
    type: 'ROOKIE' as ProbationTypeValue,
    startsAt: dateInputValue(new Date()),
    endsAt: dateAfterDays(14),
  })
  const [moveType, setMoveType] = useState<ProbationTypeValue>('ROOKIE')
  const [result, setResult] = useState({ status: 'PASSED' as Exclude<ProbationStatusValue, 'ACTIVE'>, resultNote: '' })
  const [entryForm, setEntryForm] = useState({ rating: 'POSITIVE' as ProbationEntryRatingValue, comment: '' })

  const probationsByType = useMemo(() => {
    const map = new Map<ProbationTypeValue, Probation[]>()
    for (const type of PROBATION_TYPES) map.set(type, [])
    for (const probation of probations ?? []) {
      map.get(probation.type)?.push(probation)
    }
    return map
  }, [probations])

  const visibleProbations = useMemo(() => probationsByType.get(activeType) ?? [], [probationsByType, activeType])
  const selectedProbation = useMemo(
    () => visibleProbations.find((probation) => probation.id === selectedId) ?? visibleProbations[0] ?? null,
    [visibleProbations, selectedId],
  )

  useEffect(() => {
    if (!selectedProbation) {
      setSelectedId(null)
      return
    }
    if (selectedProbation.id !== selectedId) setSelectedId(selectedProbation.id)
  }, [selectedProbation, selectedId])

  useEffect(() => {
    if (selectedProbation) setMoveType(selectedProbation.type)
  }, [selectedProbation])

  const officerOptions = useMemo(() => (officers ?? [])
    .filter((officer) => officer.status !== 'TERMINATED')
    .map((officer) => ({
      value: officer.id,
      label: `${officer.firstName} ${officer.lastName} #${displayBadgeNumber(officer.badgeNumber)} (${officer.rank.name})`,
    })), [officers])

  const createProbation = async () => {
    if (!form.officerId || !form.endsAt) return
    try {
      const created = await execute('/api/probations', { method: 'POST', body: JSON.stringify(form) }) as Probation | null
      addToast({ type: 'success', title: 'Probezeit angelegt' })
      setModalOpen(false)
      setActiveType(form.type)
      setSelectedId(created?.id ?? null)
      setForm({ officerId: '', type: 'ROOKIE', startsAt: dateInputValue(new Date()), endsAt: dateAfterDays(14) })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Probezeit konnte nicht angelegt werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const toggleChecklist = async (probation: Probation, itemId: string) => {
    const checklist = (probation.checklist ?? []).map((item) => item.id === itemId ? { ...item, completed: !item.completed } : item)
    try {
      await execute(`/api/probations/${probation.id}`, { method: 'PATCH', body: JSON.stringify({ checklist }) })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Checkliste konnte nicht gespeichert werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const decideProbation = async () => {
    if (!resultModal) return
    try {
      await execute(`/api/probations/${resultModal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: result.status, resultNote: result.resultNote }),
      })
      addToast({ type: 'success', title: 'Probezeit beendet' })
      setResultModal(null)
      setResult({ status: 'PASSED', resultNote: '' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Probezeit konnte nicht aktualisiert werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const moveProbation = async () => {
    if (!selectedProbation || moveType === selectedProbation.type) return
    const probationId = selectedProbation.id
    const targetType = moveType
    try {
      const updated = await execute(`/api/probations/${probationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ type: targetType }),
      }) as Probation | null
      setProbations((current) => current
        ? current.map((probation) => probation.id === probationId ? (updated ?? { ...probation, type: targetType }) : probation)
        : current)
      setActiveType(targetType)
      setSelectedId(probationId)
      addToast({ type: 'success', title: 'Probezeit verschoben' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Probezeit konnte nicht verschoben werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const deleteProbation = async () => {
    if (!deleteModal) return
    const probationId = deleteModal.id
    try {
      await execute(`/api/probations/${probationId}`, { method: 'DELETE' })
      setProbations((current) => current ? current.filter((probation) => probation.id !== probationId) : current)
      if (selectedId === probationId) setSelectedId(null)
      addToast({ type: 'success', title: 'Probezeit gelöscht' })
      setDeleteModal(null)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Probezeit konnte nicht gelöscht werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const addEntry = async () => {
    if (!selectedProbation || !entryForm.comment.trim()) return
    try {
      await execute(`/api/probations/${selectedProbation.id}/entries`, {
        method: 'POST',
        body: JSON.stringify({ rating: entryForm.rating, comment: entryForm.comment }),
      })
      addToast({ type: 'success', title: 'Eintrag gespeichert' })
      setEntryForm({ rating: 'POSITIVE', comment: '' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Eintrag konnte nicht gespeichert werden', message: err instanceof Error ? err.message : '' })
    }
  }

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  const stats = selectedProbation ? entryStats(selectedProbation.entries ?? []) : null
  const checklist = selectedProbation?.checklist ?? []
  const completedChecklist = checklist.filter((item) => item.completed).length
  const overdue = selectedProbation?.status === 'ACTIVE' && new Date(selectedProbation.endsAt) < new Date()

  return (
    <div className={cn(embedded ? 'w-full' : 'mx-auto max-w-6xl', 'space-y-5')}>
      <PageHeader
        title="Probezeiten"
        description="Rookie-, Supervisor-, Leitungs- und Chief-Probezeiten mit Verlauf"
        action={(
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={refetch}><RefreshCw size={13} /> Aktualisieren</Button>
            {canManage && <Button size="sm" onClick={() => setModalOpen(true)}><Plus size={13} /> Probezeit</Button>}
          </div>
        )}
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {PROBATION_TYPES.map((type) => {
          const active = activeType === type
          const count = probationsByType.get(type)?.length ?? 0
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType(type)}
              className={cn(
                'flex min-h-[54px] items-center justify-between gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-gold/45 bg-gold/14 text-gold'
                  : 'border-line bg-surface text-label-2 hover:border-line hover:text-label',
              )}
            >
              <span className="min-w-0 text-[12.5px] font-semibold leading-snug">{PROBATION_TYPE_LABELS[type]}</span>
              <span className="rounded-full border border-current/25 px-2 py-[2px] text-[11px] font-semibold">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="glass-panel-elevated rounded-[12px] border border-line">
          <div className="border-b border-line px-4 py-3">
            <p className="text-[13px] font-semibold text-label">{PROBATION_TYPE_LABELS[activeType]}</p>
            <p className="mt-0.5 text-[11.5px] text-label-3">{visibleProbations.length} Einträge</p>
          </div>
          <div className="max-h-[620px] overflow-y-auto p-2">
            {visibleProbations.length > 0 ? (
              <div className="space-y-1.5">
                {visibleProbations.map((probation) => {
                  const rowStats = entryStats(probation.entries ?? [])
                  const selected = selectedProbation?.id === probation.id
                  return (
                    <button
                      key={probation.id}
                      type="button"
                      onClick={() => setSelectedId(probation.id)}
                      className={cn(
                        'w-full rounded-[10px] border px-3 py-3 text-left transition-colors',
                        selected
                          ? 'border-gold/45 bg-gold/7'
                          : 'border-transparent bg-surface hover:border-line hover:bg-surface-2',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-label">
                            {probation.officer.firstName} {probation.officer.lastName}
                            <span className="ml-1 font-mono text-label-3">#{displayBadgeNumber(probation.officer.badgeNumber)}</span>
                          </p>
                          <p className="mt-1 truncate text-[11.5px] text-label-2">{probation.officer.rank.name} · {formatDate(probation.startsAt)} bis {formatDate(probation.endsAt)}</p>
                        </div>
                        <span className={cn('shrink-0 rounded-full border px-2 py-[3px] text-[11px] font-semibold', statusClass(probation.status))}>
                          {PROBATION_STATUS_LABELS[probation.status]}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[11.5px]">
                        <span className="inline-flex items-center gap-1 text-green"><ThumbsUp size={12} /> {rowStats.positive}</span>
                        <span className="inline-flex items-center gap-1 text-red"><ThumbsDown size={12} /> {rowStats.negative}</span>
                        <span className="text-label-4">Ratio {rowStats.total > 0 ? `${rowStats.positiveRate}%` : '—'}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="py-20 text-center">
                <ClipboardCheck size={28} className="mx-auto mb-3 text-gold/35" />
                <p className="text-[13px] text-label-2">Keine Probezeiten in dieser Liste</p>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel-elevated rounded-[12px] border border-line p-4">
          {selectedProbation ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/officers/${selectedProbation.officer.id}`} className="text-[16px] font-semibold text-label hover:text-gold-bright">
                    {selectedProbation.officer.firstName} {selectedProbation.officer.lastName}
                    <span className="ml-1 font-mono text-label-3">#{displayBadgeNumber(selectedProbation.officer.badgeNumber)}</span>
                  </Link>
                  <p className="mt-1 text-[12px] text-label-2">
                    {PROBATION_TYPE_LABELS[selectedProbation.type]} · {formatDate(selectedProbation.startsAt)} bis {formatDate(selectedProbation.endsAt)}
                  </p>
                </div>
                <span className={cn('w-fit rounded-full border px-2.5 py-1 text-[11.5px] font-semibold', statusClass(selectedProbation.status))}>
                  {PROBATION_STATUS_LABELS[selectedProbation.status]}
                </span>
              </div>

              {overdue && (
                <p className="rounded-[8px] border border-red/18 bg-red/8 px-3 py-2 text-[12px] text-red">
                  Probezeit ist überfällig.
                </p>
              )}

              {canManage && (
                <div className="rounded-[12px] border border-line bg-white/[0.03] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold text-label">Verwaltung</p>
                    <Button variant="danger" size="sm" onClick={() => setDeleteModal(selectedProbation)}>
                      <Trash2 size={13} /> Löschen
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <Select
                      label="Kategorie"
                      value={moveType}
                      onValueChange={(type) => setMoveType(type as ProbationTypeValue)}
                      options={typeOptions}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="self-end"
                      onClick={moveProbation}
                      disabled={moveType === selectedProbation.type}
                    >
                      <ArrowRightLeft size={13} /> Verschieben
                    </Button>
                    <Button
                      size="sm"
                      className="self-end"
                      onClick={() => { setResultModal(selectedProbation); setResult({ status: 'PASSED', resultNote: '' }) }}
                      disabled={selectedProbation.status !== 'ACTIVE'}
                    >
                      <CheckCircle2 size={13} /> Beenden
                    </Button>
                  </div>
                </div>
              )}

              {stats && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-[10px] border border-green/11 bg-green/5 px-3 py-2.5">
                    <p className="text-[11px] text-green">Positiv</p>
                    <p className="mt-1 text-[18px] font-semibold text-label">{stats.positive}</p>
                  </div>
                  <div className="rounded-[10px] border border-red/14 bg-red/5 px-3 py-2.5">
                    <p className="text-[11px] text-red">Negativ</p>
                    <p className="mt-1 text-[18px] font-semibold text-label">{stats.negative}</p>
                  </div>
                  <div className="rounded-[10px] border border-line bg-surface px-3 py-2.5">
                    <p className="text-[11px] text-label-2">Ratio</p>
                    <p className="mt-1 text-[18px] font-semibold text-label">{stats.total > 0 ? `${stats.positiveRate}%` : '—'}</p>
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-label">Checkliste</p>
                  <span className="text-[12px] text-label-2">{completedChecklist}/{checklist.length} erledigt</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {checklist.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!canManage || selectedProbation.status !== 'ACTIVE'}
                      onClick={() => toggleChecklist(selectedProbation, item.id)}
                      className="flex min-h-[38px] w-full items-center gap-2 rounded-[8px] border border-line bg-surface px-3 py-2 text-left text-[12.5px] text-label-2 disabled:cursor-default"
                    >
                      {item.completed ? <CheckCircle2 size={15} className="shrink-0 text-green" /> : <XCircle size={15} className="shrink-0 text-label-3" />}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {canManage && (
                <div className="rounded-[12px] border border-line bg-white/[0.03] p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <MessageSquarePlus size={14} className="text-gold" />
                    <p className="text-[13px] font-semibold text-label">Eintrag hinzufügen</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <Select
                      label="Bewertung"
                      value={entryForm.rating}
                      onValueChange={(rating) => setEntryForm({ ...entryForm, rating: rating as ProbationEntryRatingValue })}
                      options={[
                        { value: 'POSITIVE', label: 'Positiv' },
                        { value: 'NEGATIVE', label: 'Negativ' },
                      ]}
                    />
                    <Textarea
                      label="Kommentar"
                      value={entryForm.comment}
                      onChange={(e) => setEntryForm({ ...entryForm, comment: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" onClick={addEntry} disabled={!entryForm.comment.trim()}>
                      Speichern
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-label">Historie</p>
                </div>
                <div className="space-y-2">
                  {(selectedProbation.entries ?? []).length > 0 ? (
                    selectedProbation.entries.map((entry) => (
                      <div key={entry.id} className="rounded-[10px] border border-line bg-surface px-3 py-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className={cn('inline-flex items-center rounded-full border px-2 py-[3px] text-[11px] font-semibold', ratingClass(entry.rating))}>
                            {PROBATION_ENTRY_RATING_LABELS[entry.rating]}
                          </span>
                          <span className="text-[11px] text-label-3">
                            {formatDateTime(entry.createdAt)} · {entry.createdBy?.displayName ?? 'Gelöscht'}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-label-2">{entry.comment}</p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-[10px] border border-dashed border-line bg-white/[0.03] px-3 py-4 text-center text-[12.5px] text-label-3">
                      Noch keine Einträge vorhanden
                    </p>
                  )}
                </div>
                {selectedProbation.resultNote && (
                  <div className="mt-3 rounded-[10px] border border-line bg-white/[0.03] px-3 py-3">
                    <p className="text-[11.5px] text-label-2">Ergebnisnotiz</p>
                    <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-label-2">{selectedProbation.resultNote}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-28 text-center">
              <ClipboardCheck size={28} className="mx-auto mb-3 text-gold/35" />
              <p className="text-[13px] text-label-2">Keine Probezeit ausgewählt</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Probezeit anlegen">
        <div className="space-y-4">
          <Select label="Officer" value={form.officerId} onValueChange={(officerId) => setForm({ ...form, officerId })} options={officerOptions} placeholder="Officer wählen..." />
          <Select label="Typ" value={form.type} onValueChange={(type) => setForm({ ...form, type: type as ProbationTypeValue })} options={typeOptions} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Start" type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            <Input label="Ende" type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={createProbation} disabled={!form.officerId || !form.endsAt}>Anlegen</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resultModal} onClose={() => setResultModal(null)} title="Probezeit beenden">
        <div className="space-y-4">
          <Select
            label="Ergebnis"
            value={result.status}
            onValueChange={(status) => setResult({ ...result, status: status as Exclude<ProbationStatusValue, 'ACTIVE'> })}
            options={[
              { value: 'PASSED', label: 'Bestanden' },
              { value: 'EXTENDED', label: 'Verlängert' },
              { value: 'FAILED', label: 'Nicht bestanden' },
            ]}
          />
          <Textarea label="Kommentar" value={result.resultNote} onChange={(e) => setResult({ ...result, resultNote: e.target.value })} rows={4} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setResultModal(null)}>Abbrechen</Button>
            <Button size="sm" onClick={decideProbation}>Beenden</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Probezeit löschen">
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-label-2">
            Diese Probezeit inklusive Historie wird dauerhaft gelöscht.
          </p>
          {deleteModal && (
            <div className="rounded-[10px] border border-line bg-surface px-3 py-3">
              <p className="text-[13px] font-semibold text-label">
                {deleteModal.officer.firstName} {deleteModal.officer.lastName}
                <span className="ml-1 font-mono text-label-3">#{displayBadgeNumber(deleteModal.officer.badgeNumber)}</span>
              </p>
              <p className="mt-1 text-[12px] text-label-2">
                {PROBATION_TYPE_LABELS[deleteModal.type]} · {formatDate(deleteModal.startsAt)} bis {formatDate(deleteModal.endsAt)}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteModal(null)}>Abbrechen</Button>
            <Button variant="danger" size="sm" onClick={deleteProbation}><Trash2 size={13} /> Löschen</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
