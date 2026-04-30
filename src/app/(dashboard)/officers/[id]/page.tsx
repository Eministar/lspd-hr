'use client'

import { useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Edit, Trash2, UserX, UserCheck, Save, X, Check, TrendingUp, TrendingDown, Plus, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { UnitMultiSelect } from '@/components/officers/unit-multi-select'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/context/auth-context'
import {
  cn,
  formatDate,
  formatDateTime,
  getStatusLabel,
  getStatusDot,
  getUnitLabel,
  getUnitBadgeClass,
  getFlagLabel,
  getFlagColor,
} from '@/lib/utils'
import { hasPermission } from '@/lib/permissions'
import { officerUnitKeys } from '@/lib/officer-units'

interface Rank { id: string; name: string; sortOrder: number; color: string }
interface Unit { id: string; key: string; name: string; color: string; active: boolean }
interface Training { id: string; key: string; label: string; sortOrder: number }
interface OfficerTraining { id: string; trainingId: string; completed: boolean; training: Training }
interface PromotionLog {
  id: string
  note: string | null
  createdAt: string
  oldRank: Rank
  newRank: Rank
  performedBy: { displayName: string }
}
interface OfficerNote {
  id: string
  title: string | null
  content: string
  createdAt: string
  author: { displayName: string }
}
interface OfficerDetail {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  rankId: string
  rank: Rank
  status: string
  unit: string | null
  units: string[] | null
  flag: string | null
  notes: string | null
  hireDate: string
  lastOnline: string | null
  discordId: string | null
  trainings: OfficerTraining[]
  promotionLogs: PromotionLog[]
  officerNotes: OfficerNote[]
}
interface OfficerForm {
  badgeNumber: string
  firstName: string
  lastName: string
  rankId: string
  notes: string
  status: string
  units: string[]
  flag: string
  hireDate: string
  discordId: string
}

const EMPTY_OFFICER_FORM: OfficerForm = {
  badgeNumber: '',
  firstName: '',
  lastName: '',
  rankId: '',
  notes: '',
  status: 'ACTIVE',
  units: [],
  flag: '',
  hireDate: '',
  discordId: '',
}

export default function OfficerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { addToast } = useToast()
  const { user } = useAuth()
  const { execute } = useApi()
  const canViewOfficer = hasPermission(user, 'officers:view')
  const canEditOfficer = hasPermission(user, 'officers:write')
  const canEditTrainings = hasPermission(user, 'officer-trainings:manage')
  const canDeleteOfficer = hasPermission(user, 'officers:delete')
  const canRankChange = hasPermission(user, 'rank-changes:manage')
  const canTerminate = hasPermission(user, 'terminations:manage')
  const canManageNotes = hasPermission(user, 'notes:manage')
  const { data: officer, loading, refetch, setData: setOfficer } = useFetch<OfficerDetail>(canViewOfficer ? `/api/officers/${id}` : null)
  const { data: ranks } = useFetch<Rank[]>(canEditOfficer || canRankChange ? '/api/ranks' : null)
  const { data: units } = useFetch<Unit[]>(canEditOfficer ? '/api/units?active=true' : null)

  const [editing, setEditing] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [terminateModal, setTerminateModal] = useState(false)
  const [promoteModal, setPromoteModal] = useState(false)
  const [demoteModal, setDemoteModal] = useState(false)
  const [noteModal, setNoteModal] = useState(false)
  const [terminateReason, setTerminateReason] = useState('')
  const [newRankId, setNewRankId] = useState('')
  const [newBadgeNumber, setNewBadgeNumber] = useState('')
  const [rankChangeNote, setRankChangeNote] = useState('')
  const [noteForm, setNoteForm] = useState({ title: '', content: '' })
  const [form, setForm] = useState<OfficerForm>(EMPTY_OFFICER_FORM)

  const startEditing = () => {
    if (!officer) return
    setForm({
      badgeNumber: officer.badgeNumber,
      firstName: officer.firstName,
      lastName: officer.lastName,
      rankId: officer.rankId,
      notes: officer.notes || '',
      status: officer.status,
      units: officerUnitKeys(officer),
      flag: officer.flag ?? '',
      hireDate: officer.hireDate?.split('T')[0] || '',
      discordId: officer.discordId ?? '',
    })
    setEditing(true)
  }

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        units: form.units,
        flag: form.flag ? form.flag : null,
        discordId: form.discordId.trim() === '' ? null : form.discordId.trim(),
      }
      await execute(`/api/officers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      addToast({ type: 'success', title: 'Officer aktualisiert' })
      setEditing(false)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleFlagChange = async (next: string | null) => {
    try {
      await execute(`/api/officers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ flag: next }),
      })
      addToast({ type: 'success', title: next ? `Markierung: ${getFlagLabel(next)}` : 'Markierung entfernt' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleDelete = async () => {
    try {
      await execute(`/api/officers/${id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Officer gelöscht' })
      router.push('/officers')
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleTerminate = async () => {
    try {
      await execute('/api/terminations', {
        method: 'POST',
        body: JSON.stringify({ officerId: id, reason: terminateReason }),
      })
      addToast({ type: 'success', title: 'Officer gekündigt' })
      setTerminateModal(false)
      setTerminateReason('')
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleReactivate = async () => {
    try {
      await execute(`/api/officers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) })
      addToast({ type: 'success', title: 'Officer reaktiviert' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleRankChange = async (direction: 'up' | 'down') => {
    if (!newRankId) return
    try {
      await execute('/api/promotions', {
        method: 'POST',
        body: JSON.stringify({
          officerId: id,
          newRankId,
          newBadgeNumber: newBadgeNumber || undefined,
          note: rankChangeNote || undefined,
        }),
      })
      addToast({ type: 'success', title: direction === 'up' ? 'Beförderung durchgeführt' : 'Degradierung durchgeführt' })
      setPromoteModal(false)
      setDemoteModal(false)
      setNewRankId('')
      setNewBadgeNumber('')
      setRankChangeNote('')
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleAddNote = async () => {
    if (!noteForm.content.trim()) return
    try {
      await execute('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ ...noteForm, officerId: id }),
      })
      addToast({ type: 'success', title: 'Notiz hinzugefügt' })
      setNoteModal(false)
      setNoteForm({ title: '', content: '' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleTrainingToggle = useCallback(async (trainingId: string, completed: boolean) => {
    if (!canEditTrainings) return
    if (!officer) return
    const previous = officer
    const trainings = officer.trainings.map((t) => ({
      trainingId: t.trainingId,
      completed: t.trainingId === trainingId ? completed : t.completed,
    }))
    setOfficer((o) => o ? ({
      ...o,
      trainings: o.trainings.map((t) =>
        t.trainingId === trainingId ? { ...t, completed } : t
      ),
    }) : o)
    try {
      const res = await fetch(`/api/officers/${id}/trainings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainings }),
      })
      const json = await res.json() as { data?: { officer?: OfficerDetail }; error?: string }
      if (!res.ok) throw new Error(json.error || 'Fehler')
      if (json.data?.officer) setOfficer(json.data.officer)
    } catch {
      setOfficer(previous)
      addToast({ type: 'error', title: 'Fehler beim Aktualisieren' })
    }
  }, [canEditTrainings, officer, id, setOfficer, addToast])

  if (!canViewOfficer) return <UnauthorizedContent />
  if (loading) return <PageLoader />
  if (!officer) return <div className="text-center py-16 text-[#999]">Officer nicht gefunden</div>

  const higherRanks = ranks?.filter(r => r.sortOrder < officer.rank?.sortOrder) || []
  const lowerRanks = ranks?.filter(r => r.sortOrder > officer.rank?.sortOrder) || []

  return (
    <div>
      <PageHeader
        title={`${officer.firstName} ${officer.lastName}`}
        description={`DN: ${officer.badgeNumber} · ${officer.rank?.name}`}
        action={
          <div className="flex gap-1.5 flex-wrap">
            <Link href="/officers">
              <Button variant="ghost" size="sm"><ArrowLeft size={15} strokeWidth={1.75} /> Zurück</Button>
            </Link>
            {!editing ? (
              canEditOfficer && (
                <Button variant="secondary" size="sm" onClick={startEditing}><Edit size={14} strokeWidth={1.75} /> Bearbeiten</Button>
              )
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditing(false)}><X size={14} /> Abbrechen</Button>
                <Button size="sm" onClick={handleSave}><Save size={14} strokeWidth={1.75} /> Speichern</Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: main info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Personal data */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className="glass-panel-elevated rounded-[14px] p-5">
            <h3 className="text-[13.5px] font-semibold text-[#eee] mb-4">Persönliche Daten</h3>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Vorname" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                  <Input label="Nachname" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Dienstnummer" value={form.badgeNumber} onChange={(e) => setForm({ ...form, badgeNumber: e.target.value })} />
                  <Select label="Rang" value={form.rankId} onChange={(e) => setForm({ ...form, rankId: e.target.value })} options={ranks?.map(r => ({ value: r.id, label: r.name })) || []} />
                </div>
                <Input
                  label="Discord-ID"
                  value={form.discordId}
                  onChange={(e) => setForm({ ...form, discordId: e.target.value })}
                  placeholder="Optional (Snowflake)"
                  className="font-mono"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={[
                    { value: 'ACTIVE', label: 'Aktiv' },
                    { value: 'AWAY', label: 'Abgemeldet' },
                    { value: 'INACTIVE', label: 'Inaktiv' },
                      { value: 'TERMINATED', label: 'Gekündigt' },
                  ]} />
                  <DateField
                    label="Einstellungsdatum"
                    value={form.hireDate}
                    onChange={(v) => setForm({ ...form, hireDate: v })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <UnitMultiSelect value={form.units} units={units ?? undefined} onChange={(value) => setForm({ ...form, units: value })} />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-[#9fb0c4] mb-1.5">Markierung</label>
                  <FlagPicker value={form.flag ?? null} onChange={(v) => setForm({ ...form, flag: v ?? '' })} />
                </div>
                <Textarea label="Notizen" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-5 gap-x-6">
                <InfoRow label="Dienstnummer" value={officer.badgeNumber} mono />
                <InfoRow label="Discord-ID" value={officer.discordId ?? undefined} mono />
                <InfoRow label="Rang">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: officer.rank?.color }} />
                    <span className="text-[13.5px] text-[#eee]">{officer.rank?.name}</span>
                  </span>
                </InfoRow>
                <InfoRow label="Status">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn('h-[6px] w-[6px] rounded-full', getStatusDot(officer.status))} />
                    <span className="text-[13.5px] text-[#eee]">{getStatusLabel(officer.status)}</span>
                  </span>
                </InfoRow>
                <InfoRow label="Einstellungsdatum" value={formatDate(officer.hireDate)} />
                <InfoRow label="Units">
                  {officerUnitKeys(officer).length > 0 ? (
                    <span className="inline-flex flex-wrap gap-1.5">
                      {officerUnitKeys(officer).map((unitKey) => {
                        const unit = units?.find((u) => u.key === unitKey)
                        return (
                          <span
                            key={unitKey}
                            className={cn(
                              'inline-flex items-center px-2 py-[3px] rounded-full text-[11.5px] font-medium border',
                              unit ? 'bg-[#0f2340]/70' : getUnitBadgeClass(unitKey)
                            )}
                            style={unit ? { borderColor: `${unit.color}66`, color: unit.color } : undefined}
                          >
                            {unit?.name ?? getUnitLabel(unitKey)}
                          </span>
                        )
                      })}
                    </span>
                  ) : (
                    <span className="text-[13.5px] text-[#4a6585]">—</span>
                  )}
                </InfoRow>
                <InfoRow label="Markierung">
                  {officer.flag ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-[10px] w-[10px] rounded-full"
                        style={{ backgroundColor: getFlagColor(officer.flag) }}
                      />
                      <span className="text-[13.5px] text-[#eee]">{getFlagLabel(officer.flag)}</span>
                    </span>
                  ) : (
                    <span className="text-[13.5px] text-[#4a6585]">—</span>
                  )}
                </InfoRow>
                <InfoRow label="Zuletzt Online" value={formatDateTime(officer.lastOnline)} />
                {officer.notes && (
                  <div className="col-span-full">
                    <InfoRow label="Notizen" value={officer.notes} />
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Trainings -- toggleable directly */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
            className="glass-panel-elevated rounded-[14px] p-5">
            <h3 className="text-[13.5px] font-semibold text-[#eee] mb-4">Ausbildungen</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {officer.trainings?.map((t) => (
                <button
                  key={t.id}
                  disabled={!canEditTrainings}
                  onClick={() => canEditTrainings && handleTrainingToggle(t.trainingId, !t.completed)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] transition-all duration-150 text-left',
                    t.completed
                      ? 'bg-[#0f2340] hover:bg-[#142d52]'
                      : 'hover:bg-[#0f2340]',
                    !canEditTrainings && 'cursor-not-allowed opacity-75'
                  )}
                >
                  <div className={cn(
                    'h-[18px] w-[18px] rounded-[4px] flex items-center justify-center shrink-0 transition-colors',
                    t.completed ? 'bg-[#d4af37]' : 'bg-[#18385f]'
                  )}>
                    {t.completed && <Check size={11} className="text-[#0b1f3a]" strokeWidth={3} />}
                  </div>
                  <span className={cn(
                    'text-[13px]',
                    t.completed ? 'text-[#eee]' : 'text-[#4a6585]'
                  )}>{t.training.label}</span>
                </button>
              ))}
            </div>
          </motion.div>

          {/* Promotion history */}
          {officer.promotionLogs?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
              className="glass-panel-elevated rounded-[14px] p-5">
              <h3 className="text-[13.5px] font-semibold text-[#eee] mb-4">Ranghistorie</h3>
              <div className="space-y-3">
                {officer.promotionLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className={cn(
                      'h-7 w-7 rounded-[6px] flex items-center justify-center shrink-0 mt-0.5',
                      log.oldRank.sortOrder > log.newRank.sortOrder
                        ? 'bg-[#0f2340]'
                        : 'bg-[#0f2340]'
                    )}>
                      {log.oldRank.sortOrder > log.newRank.sortOrder
                        ? <TrendingUp size={13} className="text-[#999]" strokeWidth={1.75} />
                        : <TrendingDown size={13} className="text-[#999]" strokeWidth={1.75} />
                      }
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-medium text-[#eee]">
                        {log.oldRank.name} → {log.newRank.name}
                      </p>
                      <p className="text-[11.5px] text-[#999] mt-0.5">{formatDate(log.createdAt)} · {log.performedBy.displayName}</p>
                      {log.note && <p className="text-[11.5px] text-[#666] mt-0.5">{log.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Right column: actions + notes */}
        <div className="space-y-4">
          {/* Quick actions */}
          {!editing && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
              className="glass-panel-elevated rounded-[14px] p-5">
              <h3 className="text-[13.5px] font-semibold text-[#eee] mb-3">Markierung</h3>
              <div className="mb-4">
                {canEditOfficer ? (
                  <FlagPicker value={officer.flag ?? null} onChange={handleFlagChange} />
                ) : (
                  <p className="text-[12.5px] text-[#4a6585]">Keine Bearbeitungsrechte</p>
                )}
              </div>
              <div className="gold-line my-3" />
              <h3 className="text-[13.5px] font-semibold text-[#eee] mb-3">Aktionen</h3>
              <div className="space-y-1.5">
                {canRankChange && officer.status !== 'TERMINATED' && higherRanks.length > 0 && (
                  <button onClick={() => { setNewRankId(''); setNewBadgeNumber(''); setRankChangeNote(''); setPromoteModal(true) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#999] hover:bg-[#0f2340] transition-colors text-left">
                    <TrendingUp size={15} strokeWidth={1.75} /> Befördern
                  </button>
                )}
                {canRankChange && officer.status !== 'TERMINATED' && lowerRanks.length > 0 && (
                  <button onClick={() => { setNewRankId(''); setNewBadgeNumber(''); setRankChangeNote(''); setDemoteModal(true) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#999] hover:bg-[#0f2340] transition-colors text-left">
                    <TrendingDown size={15} strokeWidth={1.75} /> Degradieren
                  </button>
                )}
                {canManageNotes && (
                  <button onClick={() => { setNoteForm({ title: '', content: '' }); setNoteModal(true) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#999] hover:bg-[#0f2340] transition-colors text-left">
                    <StickyNote size={15} strokeWidth={1.75} /> Notiz hinzufügen
                  </button>
                )}
                {canEditOfficer && officer.status === 'TERMINATED' ? (
                  <button onClick={handleReactivate}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#34d399] hover:bg-[#0f2340] transition-colors text-left">
                    <UserCheck size={15} strokeWidth={1.75} /> Reaktivieren
                  </button>
                ) : canTerminate ? (
                  <button onClick={() => { setTerminateReason(''); setTerminateModal(true) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#f87171] hover:bg-[#1c1111] transition-colors text-left">
                    <UserX size={15} strokeWidth={1.75} /> Kündigen
                  </button>
                ) : null}
                {canDeleteOfficer && (
                  <button onClick={() => setDeleteModal(true)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#f87171] hover:bg-[#1c1111] transition-colors text-left">
                    <Trash2 size={15} strokeWidth={1.75} /> Löschen
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Notes */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
            className="glass-panel-elevated rounded-[14px] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13.5px] font-semibold text-[#eee]">Notizen</h3>
              {canManageNotes && (
                <button onClick={() => { setNoteForm({ title: '', content: '' }); setNoteModal(true) }}
                  className="p-1 rounded-[6px] hover:bg-[#0f2340] transition-colors">
                  <Plus size={14} className="text-[#4a6585]" />
                </button>
              )}
            </div>
            {officer.officerNotes?.length > 0 ? (
              <div className="space-y-2.5">
                {officer.officerNotes.map((note) => (
                  <div key={note.id} className="bg-[#0f2340] rounded-[8px] p-3">
                    {note.title && <p className="text-[13px] font-medium text-[#eee] mb-1">{note.title}</p>}
                    <p className="text-[13px] text-[#999] leading-relaxed">{note.content}</p>
                    <p className="text-[11px] text-[#4a6585] mt-2">{formatDate(note.createdAt)} · {note.author.displayName}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-[#4a6585]">Keine Notizen vorhanden</p>
            )}
          </motion.div>
        </div>
      </div>

      {/* Delete modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Officer löschen">
        <p className="text-[13px] text-[#888] mb-5">
          Soll <strong className="text-[#eee]">{officer.firstName} {officer.lastName}</strong> unwiderruflich gelöscht werden?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDeleteModal(false)}>Abbrechen</Button>
          <Button variant="danger" size="sm" onClick={handleDelete}>Endgültig löschen</Button>
        </div>
      </Modal>

      {/* Terminate modal */}
      <Modal open={terminateModal} onClose={() => setTerminateModal(false)} title="Officer kündigen">
        <div className="space-y-4">
          <p className="text-[13px] text-[#888]">
            <strong className="text-[#eee]">{officer.firstName} {officer.lastName}</strong> wird gekündigt.
          </p>
          <Textarea label="Kündigungsgrund" value={terminateReason} onChange={(e) => setTerminateReason(e.target.value)} rows={3} required placeholder="Grund..." />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTerminateModal(false)}>Abbrechen</Button>
            <Button variant="danger" size="sm" onClick={handleTerminate} disabled={!terminateReason.trim()}>Kündigung bestätigen</Button>
          </div>
        </div>
      </Modal>

      {/* Promote modal */}
      <Modal open={promoteModal} onClose={() => setPromoteModal(false)} title="Beförderung">
        <div className="space-y-4">
          <div className="px-3 py-2.5 bg-[#0f2340] rounded-[8px]">
            <p className="text-[13px] text-[#888]">Aktuell: <strong className="text-[#eee]">{officer.rank?.name}</strong></p>
          </div>
          <Select label="Neuer Rang (höher)" value={newRankId} onChange={(e) => setNewRankId(e.target.value)}
            options={higherRanks.map(r => ({ value: r.id, label: r.name }))} placeholder="Rang wählen..." />
          <Input label="Neue DN (optional)" value={newBadgeNumber} onChange={(e) => setNewBadgeNumber(e.target.value)} placeholder={`Aktuell: ${officer.badgeNumber}`} />
          <Textarea label="Notiz" value={rankChangeNote} onChange={(e) => setRankChangeNote(e.target.value)} rows={2} placeholder="Optional" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPromoteModal(false)}>Abbrechen</Button>
            <Button size="sm" onClick={() => handleRankChange('up')} disabled={!newRankId}>Befördern</Button>
          </div>
        </div>
      </Modal>

      {/* Demote modal */}
      <Modal open={demoteModal} onClose={() => setDemoteModal(false)} title="Degradierung">
        <div className="space-y-4">
          <div className="px-3 py-2.5 bg-[#0f2340] rounded-[8px]">
            <p className="text-[13px] text-[#888]">Aktuell: <strong className="text-[#eee]">{officer.rank?.name}</strong></p>
          </div>
          <Select label="Neuer Rang (niedriger)" value={newRankId} onChange={(e) => setNewRankId(e.target.value)}
            options={lowerRanks.map(r => ({ value: r.id, label: r.name }))} placeholder="Rang wählen..." />
          <Input label="Neue DN (optional)" value={newBadgeNumber} onChange={(e) => setNewBadgeNumber(e.target.value)} placeholder={`Aktuell: ${officer.badgeNumber}`} />
          <Textarea label="Grund" value={rankChangeNote} onChange={(e) => setRankChangeNote(e.target.value)} rows={2} placeholder="Grund für Degradierung..." />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDemoteModal(false)}>Abbrechen</Button>
            <Button variant="danger" size="sm" onClick={() => handleRankChange('down')} disabled={!newRankId}>Degradieren</Button>
          </div>
        </div>
      </Modal>

      {/* Note modal */}
      <Modal open={noteModal} onClose={() => setNoteModal(false)} title="Notiz hinzufügen">
        <div className="space-y-4">
          <Input label="Titel (optional)" value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} />
          <Textarea label="Inhalt" value={noteForm.content} onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })} rows={4} required placeholder="Notiz schreiben..." />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setNoteModal(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleAddNote} disabled={!noteForm.content.trim()}>Speichern</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function InfoRow({ label, value, mono, children }: { label: string; value?: string; mono?: boolean; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11.5px] text-[#999] mb-1">{label}</p>
      {children || <p className={cn('text-[13.5px] text-[#eee]', mono && 'font-mono')}>{value || '—'}</p>}
    </div>
  )
}

function FlagPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (v: string | null) => void
}) {
  const buttons: Array<{ id: string | null; label: string; ring: string; bg: string }> = [
    { id: null, label: 'Keine', ring: 'ring-[#234568]', bg: 'bg-[#0a1a33]' },
    { id: 'RED', label: 'Rot', ring: 'ring-[#ef4444]/70', bg: 'bg-[#ef4444]' },
    { id: 'ORANGE', label: 'Orange', ring: 'ring-[#f97316]/70', bg: 'bg-[#f97316]' },
    { id: 'YELLOW', label: 'Gelb', ring: 'ring-[#facc15]/70', bg: 'bg-[#facc15]' },
  ]
  return (
    <div className="flex gap-1.5 flex-wrap">
      {buttons.map((b) => {
        const active = value === b.id
        return (
          <button
            key={String(b.id)}
            type="button"
            onClick={() => onChange(b.id)}
            className={cn(
              'inline-flex items-center gap-2 h-[34px] px-3 rounded-[8px] text-[12.5px] font-medium border transition-all',
              active ? `${b.ring} ring-2 ring-inset border-transparent text-white` : 'border-[#18385f]/60 text-[#8ea4bd] hover:text-white hover:border-[#234568]'
            )}
          >
            <span
              className={cn(
                'h-[12px] w-[12px] rounded-full border',
                b.id ? `${b.bg} border-transparent` : 'bg-transparent border-[#4a6585]'
              )}
            />
            {b.label}
          </button>
        )
      })}
    </div>
  )
}
