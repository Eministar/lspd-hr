'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Gavel, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { SanctionCard, type SanctionCardOfficer, type SanctionRecord } from '@/components/sanctions/sanction-card'
import { useApi } from '@/hooks/use-api'
import { useFetch } from '@/hooks/use-fetch'
import { useAuth } from '@/context/auth-context'
import { displayBadgeNumber } from '@/lib/badge-number'
import { hasPermission } from '@/lib/permissions'
import { PENAL_GRADES, SANCTION_CATALOG, formatFineAmount, penalGradeLabel, resolveSanctionPenalty } from '@/lib/sanction-catalog'
import { cn } from '@/lib/utils'

/** Serverantwort von `GET /api/sanctions` — Karte plus Officer-Bezug. */
interface SanctionListItem extends SanctionRecord {
  officerId: string | null
  officer: {
    id: string
    firstName: string
    lastName: string
    badgeNumber: string
    status: string
    rank: { name: string; color: string } | null
  } | null
  issuedByUserId: string | null
  previousRank: string | null
  previousBadgeNumber: string | null
  previousFirstName: string | null
  previousLastName: string | null
}

interface EditForm {
  penalGrade: string
  reason: string
  dueAt: string
}

const DAY_MS = 24 * 60 * 60 * 1000

const PENAL_GRADE_OPTIONS = [
  { value: '', label: 'Alle Penal Grades' },
  ...Object.values(SANCTION_CATALOG).map((rule) => ({ value: rule.grade, label: penalGradeLabel(rule.grade) })),
]

const EDIT_PENAL_GRADE_OPTIONS = Object.values(SANCTION_CATALOG).map((rule) => ({
  value: rule.grade,
  label: penalGradeLabel(rule.grade),
}))

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Offen' },
  { value: 'PAID', label: 'Bezahlt' },
  { value: 'ESCALATED', label: 'Nicht bezahlt / verdoppelt' },
  { value: '', label: 'Alle Status' },
]

const DEADLINE_OPTIONS = [
  { value: '', label: 'Jede Frist' },
  { value: 'overdue', label: 'Überfällig' },
  { value: '24h', label: 'Läuft in 24h ab' },
  { value: '7d', label: 'Läuft in 7 Tagen ab' },
  { value: 'none', label: 'Ohne Frist' },
]

/** Officer-Daten für die Karte — fällt auf den Snapshot zurück, wenn das Profil gelöscht wurde. */
function cardOfficer(sanction: SanctionListItem): SanctionCardOfficer {
  if (sanction.officer) {
    return {
      id: sanction.officer.id,
      firstName: sanction.officer.firstName,
      lastName: sanction.officer.lastName,
      badgeNumber: sanction.officer.badgeNumber,
      rankName: sanction.officer.rank?.name ?? null,
    }
  }
  return {
    id: null,
    firstName: sanction.previousFirstName ?? 'Unbekannter',
    lastName: sanction.previousLastName ?? 'Officer',
    badgeNumber: sanction.previousBadgeNumber,
    rankName: sanction.previousRank,
  }
}

function matchesDeadline(sanction: SanctionListItem, filter: string, now: number) {
  if (!filter) return true
  if (filter === 'none') return !sanction.dueAt
  if (!sanction.dueAt) return false

  const due = new Date(sanction.dueAt).getTime()
  if (Number.isNaN(due)) return false
  if (filter === 'overdue') return due < now
  if (filter === '24h') return due >= now && due <= now + DAY_MS
  if (filter === '7d') return due >= now && due <= now + 7 * DAY_MS
  return true
}

/** Dringlichstes zuerst: offene vor erledigten, danach nach Frist, zuletzt nach Datum. */
function compareSanctions(a: SanctionListItem, b: SanctionListItem) {
  if (a.status !== b.status) {
    if (a.status === 'OPEN') return -1
    if (b.status === 'OPEN') return 1
  }
  if (a.status === 'OPEN' && b.status === 'OPEN') {
    const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY
    const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY
    if (dueA !== dueB) return dueA - dueB
  }
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

export default function SanktionenPage() {
  const { user } = useAuth()
  // Jeder eingeloggte Officer darf die Liste sehen — nur Verwalten braucht ein Recht.
  const canManage = hasPermission(user, 'sanctions:manage')
  const { data: sanctions, loading, error: loadError, refetch } = useFetch<SanctionListItem[]>('/api/sanctions')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [issuerFilter, setIssuerFilter] = useState('')
  const [deadlineFilter, setDeadlineFilter] = useState('')

  // Fristen werden gegen diese Zeitbasis geprüft; sie tickt minütlich nach.
  const [nowMs, setNowMs] = useState<number | null>(null)
  const [editing, setEditing] = useState<SanctionListItem | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ penalGrade: 'I', reason: '', dueAt: '' })
  const [toDelete, setToDelete] = useState<SanctionListItem | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now())
    updateNow()
    const interval = window.setInterval(updateNow, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const issuerOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const sanction of sanctions ?? []) {
      if (sanction.issuedByUserId && sanction.issuedBy?.displayName) {
        byId.set(sanction.issuedByUserId, sanction.issuedBy.displayName)
      }
    }
    return [
      { value: '', label: 'Alle Aussteller' },
      ...Array.from(byId, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'de')),
    ]
  }, [sanctions])

  const filtered = useMemo(() => {
    if (!sanctions) return []
    const now = nowMs ?? 0
    const needle = search.trim().toLowerCase()

    return sanctions
      .filter((sanction) => {
        if (statusFilter && sanction.status !== statusFilter) return false
        if (gradeFilter && sanction.penalGrade !== gradeFilter) return false
        if (issuerFilter && sanction.issuedByUserId !== issuerFilter) return false
        if (!matchesDeadline(sanction, deadlineFilter, now)) return false
        if (!needle) return true

        const officer = cardOfficer(sanction)
        const haystack = [
          `${officer.firstName} ${officer.lastName}`,
          displayBadgeNumber(officer.badgeNumber),
          officer.badgeNumber ?? '',
          officer.rankName ?? '',
          sanction.reason,
          sanction.penalty ?? '',
          sanction.issuedBy?.displayName ?? '',
        ].join(' ').toLowerCase()
        return haystack.includes(needle)
      })
      .sort(compareSanctions)
  }, [sanctions, search, statusFilter, gradeFilter, issuerFilter, deadlineFilter, nowMs])

  const stats = useMemo(() => {
    const now = nowMs ?? 0
    const open = (sanctions ?? []).filter((sanction) => sanction.status === 'OPEN')
    return {
      open: open.length,
      overdue: open.filter((sanction) => sanction.dueAt && new Date(sanction.dueAt).getTime() < now).length,
      openAmount: open.reduce((sum, sanction) => sum + (sanction.fineAmount ?? 0), 0),
    }
  }, [sanctions, nowMs])

  const editRule = resolveSanctionPenalty(editForm.penalGrade) ?? SANCTION_CATALOG.I

  const runAction = async (label: string, request: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await request()
      addToast({ type: 'success', title: label })
      await refetch()
      return true
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleMarkPaid = (id: string) =>
    runAction('Sanktion als bezahlt markiert', () =>
      execute(`/api/sanctions/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'MARK_PAID' }) }),
    )

  const handleEscalate = (id: string) =>
    runAction('Sanktion verdoppelt', () =>
      execute(`/api/sanctions/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'ESCALATE' }) }),
    )

  const openEdit = (sanction: SanctionListItem) => {
    setEditing(sanction)
    setEditForm({
      penalGrade: PENAL_GRADES.has(sanction.penalGrade) ? sanction.penalGrade : 'I',
      reason: sanction.reason,
      dueAt: sanction.dueAt?.split('T')[0] ?? '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editing || !editForm.reason.trim()) return
    const ok = await runAction('Sanktion aktualisiert', () =>
      execute(`/api/sanctions/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          penalGrade: editForm.penalGrade,
          reason: editForm.reason.trim(),
          dueAt: editForm.dueAt || null,
        }),
      }),
    )
    if (ok) setEditing(null)
  }

  const handleDelete = async () => {
    if (!toDelete) return
    const ok = await runAction('Sanktion gelöscht', () =>
      execute(`/api/sanctions/${toDelete.id}`, { method: 'DELETE' }),
    )
    if (ok) setToDelete(null)
  }

  if (loading) return <PageLoader />

  const filterClass =
    'h-[36px] sm:h-[34px] px-3 rounded-[8px] text-[13px] bg-[#0b1f3a] text-[#b7c5d8] border border-[#18385f]/50 focus:outline-none focus:border-[#d4af37] transition-all'

  return (
    <div>
      <PageHeader
        title="Sanktionen"
        eyebrow="Übersicht"
        description="Alle Sanktionen des Departments — filterbar nach Officer, Penal Grade, Status, Aussteller und Frist."
      />

      {loadError ? (
        <div className="glass-panel-elevated rounded-[14px] px-5 py-12 text-center">
          <AlertTriangle size={26} className="mx-auto mb-3 text-[#f87171]" strokeWidth={1.5} />
          <p className="text-[13px] text-[#fca5a5]">{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => void refetch()}>
            Erneut laden
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <StatTile label="Offene Sanktionen" value={String(stats.open)} tone="open" />
            <StatTile label="Davon überfällig" value={String(stats.overdue)} tone={stats.overdue > 0 ? 'alert' : 'neutral'} />
            <StatTile label="Offene Geldstrafen" value={formatFineAmount(stats.openAmount)} tone="gold" />
          </div>

          <div className="mb-5 flex flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6585]" strokeWidth={1.75} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Name, Dienstnummer, Rang oder Grund..."
                className={cn(filterClass, 'w-full pl-9 placeholder:text-[#4a6585]')}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
              <Select size="sm" value={statusFilter} onValueChange={setStatusFilter} options={STATUS_OPTIONS} className="lg:w-[195px]" />
              <Select size="sm" value={gradeFilter} onValueChange={setGradeFilter} options={PENAL_GRADE_OPTIONS} className="lg:w-[175px]" />
              <Select size="sm" value={issuerFilter} onValueChange={setIssuerFilter} options={issuerOptions} className="lg:w-[175px]" />
              <Select size="sm" value={deadlineFilter} onValueChange={setDeadlineFilter} options={DEADLINE_OPTIONS} className="lg:w-[175px]" />
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[12px] text-[#4a6585]">
              {filtered.length} von {sanctions?.length ?? 0} Sanktionen
            </p>
            {(sanctions?.length ?? 0) >= 1000 && (
              <p className="text-[11.5px] text-[#b45309]">Nur die 1000 neuesten Sanktionen werden geladen.</p>
            )}
          </div>

          {filtered.length > 0 ? (
            <div className="space-y-2.5">
              {filtered.map((sanction, i) => (
                <motion.div
                  key={sanction.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                >
                  <SanctionCard
                    sanction={sanction}
                    officer={cardOfficer(sanction)}
                    canSanction={canManage && !busy}
                    variant={sanction.status === 'OPEN' ? 'open' : 'history'}
                    onPaid={sanction.status === 'OPEN' ? () => void handleMarkPaid(sanction.id) : undefined}
                    onEscalate={sanction.status === 'OPEN' ? () => void handleEscalate(sanction.id) : undefined}
                    onEdit={() => openEdit(sanction)}
                    onDelete={() => setToDelete(sanction)}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="glass-panel-elevated rounded-[14px] py-20 text-center">
              <Gavel size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#999]">
                {sanctions && sanctions.length > 0 ? 'Keine Treffer für die aktuellen Filter' : 'Keine Sanktionen vorhanden'}
              </p>
            </div>
          )}
        </>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Sanktion bearbeiten">
        {editing && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-[10px] border border-[#18385f]/60 bg-[#0a1e38]/70 px-3.5 py-3">
              <Gavel size={15} className="text-[#f59e0b] shrink-0" strokeWidth={1.75} />
              <p className="text-[13px] text-[#9fb0c4]">
                Sanktion bearbeiten für{' '}
                <strong className="font-semibold text-[#eee]">
                  {cardOfficer(editing).firstName} {cardOfficer(editing).lastName}
                </strong>
              </p>
            </div>

            <Select
              label="Penal Grade"
              value={editForm.penalGrade}
              onValueChange={(penalGrade) => setEditForm({ ...editForm, penalGrade })}
              options={EDIT_PENAL_GRADE_OPTIONS}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-[9px] border border-[#18385f]/70 bg-[#0a1a33]/60 px-3 py-2.5">
                <p className="text-[12.5px] font-medium text-[#9fb0c4]">Geldstrafe</p>
                <p className="mt-1 text-[14px] font-semibold text-[#d4af37]">{formatFineAmount(editRule.fineAmount)}</p>
              </div>
              <div className="rounded-[9px] border border-[#18385f]/70 bg-[#0a1a33]/60 px-3 py-2.5">
                <p className="text-[12.5px] font-medium text-[#9fb0c4]">Maßnahme</p>
                <p className="mt-1 text-[13px] font-medium leading-snug text-[#edf4fb]">{editRule.penalty}</p>
              </div>
            </div>

            <DateField label="Frist" value={editForm.dueAt} onChange={(dueAt) => setEditForm({ ...editForm, dueAt })} />

            <Textarea
              label="Grund *"
              value={editForm.reason}
              onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
              rows={4}
              required
              placeholder="Detaillierter Grund der Sanktion..."
            />

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>Abbrechen</Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={busy || !editForm.reason.trim()}>
                <Gavel size={13} strokeWidth={2} /> Speichern
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Sanktion löschen">
        {toDelete && (
          <div className="space-y-4">
            <div className="rounded-[10px] border border-[#18385f]/60 bg-[#0a1e38]/70 px-3.5 py-3">
              <p className="text-[13px] font-semibold text-[#eee]">
                {cardOfficer(toDelete).firstName} {cardOfficer(toDelete).lastName} · {penalGradeLabel(toDelete.penalGrade)}
              </p>
              <p className="mt-1 text-[12.5px] text-[#8ea4bd]">{toDelete.reason}</p>
            </div>
            <p className="text-[12.5px] text-[#9fb0c4]">Diese Sanktion wird dauerhaft gelöscht.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setToDelete(null)}>Abbrechen</Button>
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={busy}>Löschen</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: 'open' | 'alert' | 'gold' | 'neutral' }) {
  const toneClass = {
    open: 'text-[#fbbf24]',
    alert: 'text-[#fca5a5]',
    gold: 'text-[#d4af37]',
    neutral: 'text-[#edf4fb]',
  }[tone]

  return (
    <div className="glass-panel-elevated rounded-[12px] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#4a6585]">{label}</p>
      <p className={cn('mt-1 text-[19px] font-semibold tabular-nums', toneClass)}>{value}</p>
    </div>
  )
}
