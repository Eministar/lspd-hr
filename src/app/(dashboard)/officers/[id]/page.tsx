'use client'

import { useState, useCallback, use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, CalendarPlus, Edit, Trash2, UserX, UserCheck, Save, X, Check, TrendingUp, TrendingDown, Plus, StickyNote, Timer, Send, Gavel, ListPlus, ChevronDown, ChevronUp, History, Download, MessageCircle, CircleSlash } from 'lucide-react'
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
import { UnitBadges } from '@/components/officers/unit-badges'
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
  getFlagLabel,
  getFlagColor,
} from '@/lib/utils'
import { hasPermission } from '@/lib/permissions'
import { officerUnitKeys } from '@/lib/officer-units'
import { notifyLiveUpdate } from '@/lib/live-updates'
import { displayBadgeNumber } from '@/lib/badge-number'
import {
  PENAL_GRADES,
  SANCTION_CATALOG,
  formatFineAmount,
  penalGradeLabel,
  resolveSanctionPenalty,
} from '@/lib/sanction-catalog'

interface Rank { id: string; name: string; sortOrder: number; color: string }
interface Unit { id: string; key: string; name: string; color: string; active: boolean }
interface Training {
  id: string
  key: string
  label: string
  sortOrder: number
  minRankId: string | null
  minRank: { id: string; name: string; sortOrder: number } | null
}
interface OfficerTraining { id: string; trainingId: string; completed: boolean; training: Training }
interface PromotionLog {
  id: string
  note: string | null
  createdAt: string
  oldRank: Rank
  newRank: Rank
  performedBy: { displayName: string } | null
}
interface SanctionRecord {
  id: string
  reason: string
  penalGrade: string
  fineAmount: number | null
  penalty: string | null
  status: 'OPEN' | 'PAID' | 'ESCALATED'
  dueAt: string | null
  paidAt: string | null
  escalatedAt: string | null
  parentSanctionId: string | null
  createdAt: string
  updatedAt: string
  issuedBy: { displayName: string } | null
}
interface OfficerNote {
  id: string
  title: string | null
  content: string
  createdAt: string
  author: { displayName: string } | null
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
  hiredBy?: { displayName: string | null; createdAt: string } | null
  lastOnline: string | null
  discordId: string | null
  discordMember?: {
    checked: boolean
    inGuild: boolean
  }
  trainings: OfficerTraining[]
  promotionLogs: PromotionLog[]
  sanctions: SanctionRecord[]
  officerNotes: OfficerNote[]
  dutyTime?: {
    activeSession: { id: string; clockInAt: string; currentDurationMs: number } | null
    activePlaySession: { id: string; startedAt: string; currentDurationMs: number; playerName: string; license: string | null; lastSeenAt: string } | null
    weekDurationMs: number
    playtimeWeekDurationMs: number
    sessionCount: number
    averageSessionMs: number
    longestSessionMs: number
    lastSeenAt: string | null
  }
  playtime?: {
    daily: Array<{ date: string; label: string; durationMs: number; durationLabel: string }>
    recentSessions: Array<{
      id: string
      startedAt: string
      endedAt: string | null
      lastSeenAt: string
      playerName: string
      license: string | null
      durationMs: number
    }>
  }
  absences?: {
    active: AbsenceNotice | null
    upcoming: AbsenceNotice[]
    recent: AbsenceNotice[]
  }
}
interface AbsenceNotice {
  id: string
  startsAt: string
  endsAt: string
  reason: string
  source: string
  actorDiscordId: string | null
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
interface SanctionForm {
  penalGrade: string
  reason: string
  deadlineDays: string
  dueAt: string
}
interface RankChangeList {
  id: string
  name: string
  type: string
  status: string
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

const EMPTY_SANCTION_FORM: SanctionForm = {
  penalGrade: 'I',
  reason: '',
  deadlineDays: '7',
  dueAt: '',
}

const PENAL_GRADE_OPTIONS = Object.values(SANCTION_CATALOG).map((rule) => ({
  value: rule.grade,
  label: penalGradeLabel(rule.grade),
}))
const PLAYTIME_HISTORY_COLLAPSE_LIMIT = 5

function trainingAvailableForOfficer(training: Training, officer: OfficerDetail) {
  return !training.minRank || officer.rank.sortOrder <= training.minRank.sortOrder
}

function DiscordMemberStatus({ officer }: { officer: Pick<OfficerDetail, 'discordId' | 'discordMember'> }) {
  const hasDiscordId = !!officer.discordId
  const checked = !!officer.discordMember?.checked
  const inGuild = !!officer.discordMember?.inGuild
  const label = !hasDiscordId
    ? 'Nicht verknüpft'
    : checked
      ? inGuild ? 'Auf Discord-Server' : 'Nicht auf Discord-Server'
      : 'Discord-Server ungeprüft'
  const className = !hasDiscordId || !checked
    ? 'border-[#234568]/50 bg-[#0b1f3a]/70 text-[#6b8299]'
    : inGuild
      ? 'border-[#166534]/50 bg-[#052e1a]/70 text-[#86efac]'
      : 'border-[#7f1d1d]/55 bg-[#2a1212]/70 text-[#fca5a5]'
  const Icon = hasDiscordId && checked && inGuild ? MessageCircle : CircleSlash

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-[3px] text-[11.5px] font-medium', className)}>
      <Icon size={11} strokeWidth={2} />
      {label}
    </span>
  )
}

function fmt(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

function sanctionStatusLabel(status: SanctionRecord['status']) {
  if (status === 'PAID') return 'Bezahlt'
  if (status === 'ESCALATED') return 'Nicht bezahlt / verdoppelt'
  return 'Offen'
}

function sanctionStatusClass(status: SanctionRecord['status']) {
  if (status === 'PAID') return 'border-[#166534]/60 bg-[#052e1a]/60 text-[#86efac]'
  if (status === 'ESCALATED') return 'border-[#7f1d1d]/60 bg-[#2a1212]/60 text-[#fca5a5]'
  return 'border-[#b45309]/50 bg-[#1d1608]/70 text-[#fbbf24]'
}

function sanctionDueLabel(sanction: SanctionRecord) {
  if (sanction.status === 'PAID' && sanction.paidAt) return `Bezahlt am ${formatDateTime(sanction.paidAt)}`
  if (sanction.status === 'ESCALATED' && sanction.escalatedAt) return `Verdoppelt am ${formatDateTime(sanction.escalatedAt)}`
  if (!sanction.dueAt) return 'Keine Frist'
  return `Frist bis ${formatDateTime(sanction.dueAt)}`
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
  const canSanction = hasPermission(user, 'sanctions:manage')
  const canManageNotes = hasPermission(user, 'notes:manage')
  const { data: officer, loading, refetch, setData: setOfficer } = useFetch<OfficerDetail>(canViewOfficer ? `/api/officers/${id}` : null)
  const { data: ranks } = useFetch<Rank[]>(canEditOfficer || canRankChange ? '/api/ranks' : null)
  const { data: units } = useFetch<Unit[]>(canEditOfficer ? '/api/units?active=true' : null)
  const { data: promotionLists } = useFetch<RankChangeList[]>(canRankChange ? '/api/rank-change-lists?type=PROMOTION' : null)
  const { data: demotionLists } = useFetch<RankChangeList[]>(canRankChange ? '/api/rank-change-lists?type=DEMOTION' : null)
  const draftPromotionLists = promotionLists?.filter(l => l.status === 'DRAFT') ?? []
  const draftDemotionLists = demotionLists?.filter(l => l.status === 'DRAFT') ?? []

  const [editing, setEditing] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [terminateModal, setTerminateModal] = useState(false)
  const [sanctionModal, setSanctionModal] = useState(false)
  const [promoteModal, setPromoteModal] = useState(false)
  const [demoteModal, setDemoteModal] = useState(false)
  const [noteModal, setNoteModal] = useState(false)
  const [absenceModal, setAbsenceModal] = useState(false)
  const [terminateReason, setTerminateReason] = useState('')
  const [sanctionForm, setSanctionForm] = useState<SanctionForm>(EMPTY_SANCTION_FORM)
  const [editingSanction, setEditingSanction] = useState<SanctionRecord | null>(null)
  const [sanctionToDelete, setSanctionToDelete] = useState<SanctionRecord | null>(null)
  const [newRankId, setNewRankId] = useState('')
  const [newBadgeNumber, setNewBadgeNumber] = useState('')
  const [rankChangeNote, setRankChangeNote] = useState('')
  const [noteForm, setNoteForm] = useState({ title: '', content: '' })
  const [absenceEndsAt, setAbsenceEndsAt] = useState(dateAfterDays(3))
  const [absenceReason, setAbsenceReason] = useState('')
  const [form, setForm] = useState<OfficerForm>(EMPTY_OFFICER_FORM)
  const [addToListModal, setAddToListModal] = useState<'PROMOTION' | 'DEMOTION' | null>(null)
  const [addToListId, setAddToListId] = useState('')
  const [addToListRankId, setAddToListRankId] = useState('')
  const [addToListBadgeNumber, setAddToListBadgeNumber] = useState('')
  const [addToListNote, setAddToListNote] = useState('')
  const [playtimeHistoryExpanded, setPlaytimeHistoryExpanded] = useState(false)
  const [patrolTime, setPatrolTime] = useState<{ totalSeconds: number; last7DaysSeconds: number; sessionCount: number; lastSessionAt: string | null } | null>(null)
  const [pendingTrainingOverride, setPendingTrainingOverride] = useState<{
    training: Training
    completed: boolean
  } | null>(null)
  const selectedSanctionRule = resolveSanctionPenalty(sanctionForm.penalGrade) ?? SANCTION_CATALOG.I

  useEffect(() => {
    if (!canViewOfficer) return
    fetch(`/api/officers/${id}/patrol-time`)
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { totalSeconds: number; last7DaysSeconds: number; sessionCount: number; lastSessionAt: string | null } }) => {
        if (j?.success) setPatrolTime(j.data ?? null)
      })
      .catch(() => {})
  }, [id, canViewOfficer])

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

  const openSanctionModal = () => {
    setSanctionForm(EMPTY_SANCTION_FORM)
    setEditingSanction(null)
    setSanctionModal(true)
  }

  const openEditSanctionModal = (sanction: SanctionRecord) => {
    setEditingSanction(sanction)
    setSanctionForm({
      penalGrade: PENAL_GRADES.has(sanction.penalGrade) ? sanction.penalGrade : 'I',
      reason: sanction.reason,
      deadlineDays: '',
      dueAt: sanction.dueAt?.split('T')[0] ?? '',
    })
    setSanctionModal(true)
  }

  const closeSanctionModal = () => {
    setSanctionModal(false)
    setEditingSanction(null)
    setSanctionForm(EMPTY_SANCTION_FORM)
  }

  const handleSanction = async () => {
    if (!sanctionForm.reason.trim()) return
    try {
      const isEditingSanction = !!editingSanction
      await execute(isEditingSanction ? `/api/sanctions/${editingSanction.id}` : '/api/sanctions', {
        method: isEditingSanction ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(isEditingSanction ? {} : { officerId: id }),
          penalGrade: sanctionForm.penalGrade,
          reason: sanctionForm.reason.trim(),
          ...(isEditingSanction
            ? { dueAt: sanctionForm.dueAt || null }
            : { deadlineDays: sanctionForm.deadlineDays.trim() || null }),
        }),
      })
      addToast({ type: 'success', title: isEditingSanction ? 'Sanktion aktualisiert' : 'Sanktion ausgestellt' })
      closeSanctionModal()
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleMarkSanctionPaid = async (sanctionId: string) => {
    try {
      await execute(`/api/sanctions/${sanctionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'MARK_PAID' }),
      })
      addToast({ type: 'success', title: 'Sanktion als bezahlt markiert' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleEscalateSanction = async (sanctionId: string) => {
    try {
      await execute(`/api/sanctions/${sanctionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'ESCALATE' }),
      })
      addToast({ type: 'success', title: 'Sanktion verdoppelt' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleDeleteSanction = async (sanctionId: string) => {
    try {
      await execute(`/api/sanctions/${sanctionId}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Sanktion gelöscht' })
      setSanctionToDelete(null)
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

  const handleDeleteNote = async (noteId: string) => {
    try {
      await execute(`/api/notes/${noteId}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Notiz gelöscht' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const openAbsenceModal = () => {
    setAbsenceEndsAt(dateAfterDays(3))
    setAbsenceReason('')
    setAbsenceModal(true)
  }

  const handleAddAbsence = async () => {
    if (!absenceReason.trim() || !absenceEndsAt) return
    try {
      await execute('/api/absences', {
        method: 'POST',
        body: JSON.stringify({
          officerId: id,
          endsAt: absenceEndsAt,
          reason: absenceReason.trim(),
        }),
      })
      addToast({ type: 'success', title: 'Abmeldung eingetragen' })
      setAbsenceModal(false)
      setAbsenceReason('')
      notifyLiveUpdate()
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const openAddToListModal = (type: 'PROMOTION' | 'DEMOTION') => {
    setAddToListModal(type)
    setAddToListId('')
    setAddToListRankId('')
    setAddToListBadgeNumber('')
    setAddToListNote('')
  }

  const handleAddToList = async () => {
    if (!addToListModal || !addToListId || !addToListRankId) return
    try {
      await execute(`/api/rank-change-lists/${addToListId}/entries`, {
        method: 'POST',
        body: JSON.stringify({
          officerId: id,
          proposedRankId: addToListRankId,
          newBadgeNumber: addToListBadgeNumber || undefined,
          note: addToListNote || undefined,
        }),
      })
      const label = addToListModal === 'PROMOTION' ? 'Beförderungsliste' : 'Degradierungsliste'
      addToast({ type: 'success', title: `Zur ${label} hinzugefügt` })
      setAddToListModal(null)
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleTrainingToggle = useCallback(async (trainingId: string, completed: boolean, overrideConfirmed = false) => {
    if (!canEditTrainings) return
    if (!officer) return
    const trainingRow = officer.trainings.find((t) => t.trainingId === trainingId)
    if (!trainingRow) return
    const requiresOverride = completed && !trainingAvailableForOfficer(trainingRow.training, officer)
    if (requiresOverride && !overrideConfirmed) {
      setPendingTrainingOverride({ training: trainingRow.training, completed })
      return
    }
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
        body: JSON.stringify({
          trainings,
          overrideTrainingIds: requiresOverride && overrideConfirmed ? [trainingId] : [],
        }),
      })
      const json = await res.json() as { data?: { officer?: OfficerDetail }; error?: string }
      if (!res.ok) throw new Error(json.error || 'Fehler')
      if (json.data?.officer) setOfficer(json.data.officer)
      notifyLiveUpdate()
    } catch (err) {
      setOfficer(previous)
      addToast({
        type: 'error',
        title: 'Fehler beim Aktualisieren',
        message: err instanceof Error ? err.message : '',
      })
    }
  }, [canEditTrainings, officer, id, setOfficer, setPendingTrainingOverride, addToast])

  if (!canViewOfficer) return <UnauthorizedContent />
  if (loading) return <PageLoader />
  if (!officer) return <div className="text-center py-16 text-[#999]">Officer nicht gefunden</div>

  const higherRanks = ranks?.filter(r => r.sortOrder < officer.rank?.sortOrder) || []
  const lowerRanks = ranks?.filter(r => r.sortOrder > officer.rank?.sortOrder) || []
  const addToListRanks = addToListModal === 'PROMOTION' ? higherRanks : lowerRanks
  const openSanctions = officer.sanctions?.filter((sanction) => sanction.status === 'OPEN') ?? []
  const playtimeSessions = officer.playtime?.recentSessions ?? []
  const canTogglePlaytimeHistory = playtimeSessions.length > PLAYTIME_HISTORY_COLLAPSE_LIMIT
  const visiblePlaytimeSessions = playtimeHistoryExpanded
    ? playtimeSessions
    : playtimeSessions.slice(0, PLAYTIME_HISTORY_COLLAPSE_LIMIT)

  return (
    <div>
      <PageHeader
        title={`${officer.firstName} ${officer.lastName}`}
        description={`DN: ${displayBadgeNumber(officer.badgeNumber)} · ${officer.rank?.name}`}
        action={
          <div className="flex gap-1.5 flex-wrap">
            <Link href="/officers">
              <Button variant="ghost" size="sm"><ArrowLeft size={15} strokeWidth={1.75} /> Zurück</Button>
            </Link>
            <Link href={`/officers/${id}/timeline`}>
              <Button variant="secondary" size="sm"><History size={14} strokeWidth={1.75} /> Akte</Button>
            </Link>
            <a href={`/api/exports?type=officer&format=html&officerId=${id}`} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm"><Download size={14} strokeWidth={1.75} /> Export</Button>
            </a>
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
                <InfoRow label="Dienstnummer" value={displayBadgeNumber(officer.badgeNumber)} mono />
                <InfoRow label="Discord-ID" value={officer.discordId ?? undefined} mono />
                <InfoRow label="Discord-Server">
                  <DiscordMemberStatus officer={officer} />
                </InfoRow>
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
                <InfoRow label="Eingestellt von" value={officer.hiredBy?.displayName ?? undefined} />
                <InfoRow label="Units">
                  <UnitBadges officer={officer} units={units ?? undefined} emptyClassName="text-[13.5px]" />
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

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.03 }}
            className="glass-panel-elevated rounded-[14px] p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-[13.5px] font-semibold text-[#eee]">Dienstzeiten</h3>
              <Link href="/duty-times" className="text-[12px] text-[#d4af37] hover:text-white transition-colors">Übersicht</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <DutyMetric
                label="Status"
                value={officer.dutyTime?.activeSession ? 'Im Dienst' : 'Offline'}
                active={!!officer.dutyTime?.activeSession}
              />
              <DutyMetric
                label="Aktive Spielzeit"
                value={formatDuration(officer.dutyTime?.activeSession?.currentDurationMs ?? 0)}
                active={!!officer.dutyTime?.activeSession}
              />
              <DutyMetric
                label="Diese Woche"
                value={formatDuration(officer.dutyTime?.weekDurationMs ?? 0)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
              <DutyMetric
                label="Sessions"
                value={String(officer.dutyTime?.sessionCount ?? 0)}
              />
              <DutyMetric
                label="Ø Session"
                value={formatDuration(officer.dutyTime?.averageSessionMs ?? 0)}
              />
              <DutyMetric
                label="Längste Session"
                value={formatDuration(officer.dutyTime?.longestSessionMs ?? 0)}
              />
              <DutyMetric
                label="Zuletzt gesehen"
                value={formatDateTime(officer.dutyTime?.lastSeenAt)}
                active={!!officer.dutyTime?.activePlaySession}
              />
            </div>
            {officer.dutyTime?.activeSession && (
              <p className="mt-3 text-[11.5px] text-[#7089a5]">
                Im Dienst seit {formatDateTime(officer.dutyTime.activeSession.clockInAt)}
              </p>
            )}
            {officer.dutyTime?.activePlaySession && (
              <p className="mt-1 text-[11.5px] text-[#7089a5]">
                Spieler {officer.dutyTime.activePlaySession.playerName}
                {officer.dutyTime.activePlaySession.license ? ` · ${officer.dutyTime.activePlaySession.license}` : ''}
              </p>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.04 }}
            className="glass-panel-elevated rounded-[14px] p-5">
            <h3 className="text-[13.5px] font-semibold text-[#eee] mb-4">Spielzeit</h3>
            <PlaytimeChart daily={officer.playtime?.daily ?? []} />
            <div className="gold-line my-4" />
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-[12.5px] font-semibold text-[#c7d4e4]">Verlauf</h4>
              {canTogglePlaytimeHistory && (
                <button
                  type="button"
                  onClick={() => setPlaytimeHistoryExpanded((expanded) => !expanded)}
                  className="inline-flex h-[30px] items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-medium text-[#d4af37] transition-colors hover:bg-[#0f2340] hover:text-white"
                >
                  {playtimeHistoryExpanded ? (
                    <>
                      <ChevronUp size={13} strokeWidth={1.9} />
                      Weniger anzeigen
                    </>
                  ) : (
                    <>
                      <ChevronDown size={13} strokeWidth={1.9} />
                      Alle anzeigen ({playtimeSessions.length})
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {playtimeSessions.length > 0 ? (
                visiblePlaytimeSessions.map((session) => (
                  <div key={session.id} className="flex flex-col gap-1 rounded-[8px] bg-[#0f2340]/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-[#edf4fb] truncate">{session.playerName}</p>
                      <p className="text-[11px] text-[#7089a5] truncate">{formatDateTime(session.startedAt)} → {session.endedAt ? formatDateTime(session.endedAt) : 'online'}</p>
                    </div>
                    <span className="text-[12.5px] font-semibold tabular-nums text-[#d4af37]">{formatDuration(session.durationMs)}</span>
                  </div>
                ))
              ) : (
                <p className="text-[12.5px] text-[#4a6585]">Noch keine Spielzeit empfangen</p>
              )}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
            className="glass-panel-elevated rounded-[14px] p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-[13.5px] font-semibold text-[#eee]">Abmeldungen</h3>
              {canEditOfficer && officer.status !== 'TERMINATED' && (
                <button
                  type="button"
                  onClick={openAbsenceModal}
                  className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[11.5px] text-[#d4af37] transition-colors hover:bg-[#0f2340]"
                >
                  <CalendarPlus size={12} strokeWidth={1.85} />
                  Eintragen
                </button>
              )}
            </div>
            {officer.absences?.active && (
              <div className="mb-3 rounded-[10px] border border-[#38bdf8]/25 bg-[#06233a]/70 px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[#93c5fd]">Aktiv abgemeldet</p>
                  <span className="text-[11.5px] tabular-nums text-[#d4af37]">
                    bis {formatDateTime(officer.absences.active.endsAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] text-[#c7d4e4]">{officer.absences.active.reason}</p>
              </div>
            )}
            {(officer.absences?.recent ?? []).length > 0 ? (
              <div className="space-y-2">
                {officer.absences!.recent.map((notice) => (
                  <div key={notice.id} className="rounded-[8px] bg-[#0f2340]/70 px-3 py-2.5">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[12.5px] font-medium text-[#edf4fb]">
                        {formatDateTime(notice.startsAt)} → {formatDateTime(notice.endsAt)}
                      </p>
                      <span className="text-[11px] text-[#38bdf8]">{notice.source}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-[#8ea4bd]">{notice.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-[#4a6585]">Keine Abmeldungen vorhanden</p>
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
                  title={!trainingAvailableForOfficer(t.training, officer) ? `${t.training.label} ist erst ab ${t.training.minRank?.name ?? 'Mindestrang'} vorgesehen` : t.training.label}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] transition-all duration-150 text-left',
                    t.completed
                      ? 'bg-[#0f2340] hover:bg-[#142d52]'
                      : trainingAvailableForOfficer(t.training, officer)
                        ? 'hover:bg-[#0f2340]'
                        : 'border border-dashed border-[#4a6585]/45 bg-[#061426]/70 hover:bg-[#0f2340]',
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
                    t.completed ? 'text-[#eee]' : trainingAvailableForOfficer(t.training, officer) ? 'text-[#4a6585]' : 'text-[#3f5874]'
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
                      <p className="text-[11.5px] text-[#999] mt-0.5">{formatDate(log.createdAt)} · {log.performedBy?.displayName ?? 'Gelöscht'}</p>
                      {log.note && <p className="text-[11.5px] text-[#666] mt-0.5">{log.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {openSanctions.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.11 }}
              className="glass-panel-elevated rounded-[14px] p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-[13.5px] font-semibold text-[#eee]">Offene Sanktionen</h3>
                <span className="rounded-full border border-[#b45309]/40 bg-[#1d1608]/70 px-2.5 py-1 text-[11px] font-medium text-[#fbbf24]">
                  {openSanctions.length} offen
                </span>
              </div>
              <div className="space-y-2.5">
                {openSanctions.map((sanction) => (
                  <SanctionCard key={sanction.id} sanction={sanction} canSanction={canSanction}
                    onPaid={() => handleMarkSanctionPaid(sanction.id)}
                    onEdit={() => openEditSanctionModal(sanction)}
                    onEscalate={() => handleEscalateSanction(sanction.id)}
                    onDelete={() => setSanctionToDelete(sanction)}
                    variant="open"
                  />
                ))}
              </div>
            </motion.div>
          )}

          {officer.sanctions?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.12 }}
              className="glass-panel-elevated rounded-[14px] p-5">
              <h3 className="text-[13.5px] font-semibold text-[#eee] mb-4">Sanktionshistorie</h3>
              <div className="space-y-2.5">
                {officer.sanctions.map((sanction) => (
                  <SanctionCard key={sanction.id} sanction={sanction} canSanction={canSanction}
                    onEdit={() => openEditSanctionModal(sanction)}
                    onDelete={() => setSanctionToDelete(sanction)}
                    variant="history"
                  />
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
                {canRankChange && officer.status !== 'TERMINATED' && draftPromotionLists.length > 0 && (
                  <button onClick={() => openAddToListModal('PROMOTION')}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#999] hover:bg-[#0f2340] transition-colors text-left">
                    <ListPlus size={15} strokeWidth={1.75} /> Zur Beförderungsliste
                  </button>
                )}
                {canRankChange && officer.status !== 'TERMINATED' && lowerRanks.length > 0 && (
                  <button onClick={() => { setNewRankId(''); setNewBadgeNumber(''); setRankChangeNote(''); setDemoteModal(true) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#999] hover:bg-[#0f2340] transition-colors text-left">
                    <TrendingDown size={15} strokeWidth={1.75} /> Degradieren
                  </button>
                )}
                {canRankChange && officer.status !== 'TERMINATED' && draftDemotionLists.length > 0 && (
                  <button onClick={() => openAddToListModal('DEMOTION')}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#999] hover:bg-[#0f2340] transition-colors text-left">
                    <ListPlus size={15} strokeWidth={1.75} /> Zur Degradierungsliste
                  </button>
                )}
                {canManageNotes && (
                  <button onClick={() => { setNoteForm({ title: '', content: '' }); setNoteModal(true) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#999] hover:bg-[#0f2340] transition-colors text-left">
                    <StickyNote size={15} strokeWidth={1.75} /> Notiz hinzufügen
                  </button>
                )}
                {canSanction && officer.status !== 'TERMINATED' && (
                  <button onClick={openSanctionModal}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-[#f59e0b] hover:bg-[#1d1608] transition-colors text-left">
                    <Gavel size={15} strokeWidth={1.75} /> Sanktion
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
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {note.title && <p className="text-[13px] font-medium text-[#eee] mb-1">{note.title}</p>}
                        <p className="text-[13px] text-[#999] leading-relaxed">{note.content}</p>
                      </div>
                      {canManageNotes && (
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="shrink-0 rounded-[6px] p-1 text-[#4a6585] transition-colors hover:bg-[#1c1111] hover:text-[#f87171]"
                          aria-label="Notiz löschen"
                          title="Notiz löschen"
                        >
                          <Trash2 size={13} strokeWidth={1.85} />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[#4a6585] mt-2">{formatDate(note.createdAt)} · {note.author?.displayName ?? 'Gelöscht'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-[#4a6585]">Keine Notizen vorhanden</p>
            )}
          </motion.div>

          {patrolTime && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}
              className="glass-panel-elevated rounded-[14px] p-5">
              <h3 className="text-[13.5px] font-semibold text-[#eee] mb-4">Streifenzeit</h3>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11.5px] text-[#999] mb-1">Gesamt</dt>
                  <dd className="text-[13.5px] font-semibold text-[#edf4fb] tabular-nums">{fmt(patrolTime.totalSeconds)}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#999] mb-1">Letzte 7 Tage</dt>
                  <dd className="text-[13.5px] font-semibold text-[#edf4fb] tabular-nums">{fmt(patrolTime.last7DaysSeconds)}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#999] mb-1">Streifen</dt>
                  <dd className="text-[13.5px] font-semibold text-[#edf4fb] tabular-nums">{patrolTime.sessionCount}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#999] mb-1">Letzte Streife</dt>
                  <dd className="text-[13.5px] font-semibold text-[#edf4fb]">
                    {patrolTime.lastSessionAt ? new Date(patrolTime.lastSessionAt).toLocaleDateString('de-DE') : '—'}
                  </dd>
                </div>
              </dl>
            </motion.div>
          )}
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

      <Modal open={sanctionModal} onClose={closeSanctionModal} title={editingSanction ? 'Sanktion bearbeiten' : 'Sanktion ausstellen'}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-[10px] border border-[#18385f]/60 bg-[#0a1e38]/70 px-3.5 py-3">
            <Gavel size={15} className="text-[#f59e0b] shrink-0" strokeWidth={1.75} />
            <p className="text-[13px] text-[#9fb0c4]">
              {editingSanction ? 'Sanktion bearbeiten für' : 'Neue Sanktion für'}{' '}
              <strong className="text-[#eee] font-semibold">{officer.firstName} {officer.lastName}</strong>
            </p>
          </div>

          <Select
            label="Penal Grade"
            value={sanctionForm.penalGrade}
            onValueChange={(penalGrade) => setSanctionForm({ ...sanctionForm, penalGrade })}
            options={PENAL_GRADE_OPTIONS}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[9px] border border-[#18385f]/70 bg-[#0a1a33]/60 px-3 py-2.5">
              <p className="text-[12.5px] font-medium text-[#9fb0c4]">Geldstrafe</p>
              <p className="mt-1 text-[14px] font-semibold text-[#d4af37]">{formatFineAmount(selectedSanctionRule.fineAmount)}</p>
            </div>
            <div className="rounded-[9px] border border-[#18385f]/70 bg-[#0a1a33]/60 px-3 py-2.5">
              <p className="text-[12.5px] font-medium text-[#9fb0c4]">Maßnahme</p>
              <p className="mt-1 text-[13px] font-medium leading-snug text-[#edf4fb]">{selectedSanctionRule.penalty}</p>
            </div>
          </div>

          {editingSanction ? (
            <DateField
              label="Frist"
              value={sanctionForm.dueAt}
              onChange={(dueAt) => setSanctionForm({ ...sanctionForm, dueAt })}
            />
          ) : (
            <Input
              label="Frist in Tagen (optional)"
              value={sanctionForm.deadlineDays}
              onChange={(e) => setSanctionForm({ ...sanctionForm, deadlineDays: e.target.value })}
              inputMode="numeric"
              placeholder="z.B. 7"
            />
          )}

          <Textarea
            label="Grund *"
            value={sanctionForm.reason}
            onChange={(e) => setSanctionForm({ ...sanctionForm, reason: e.target.value })}
            rows={4}
            required
            placeholder="Detaillierter Grund der Sanktion..."
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={closeSanctionModal}>Abbrechen</Button>
            <Button size="sm" onClick={handleSanction} disabled={!sanctionForm.reason.trim() || !sanctionForm.penalGrade}>
              <Gavel size={13} strokeWidth={2} />
              {editingSanction ? 'Speichern' : 'Sanktion ausstellen'}
            </Button>
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
          <Input label="Neue DN (optional)" value={newBadgeNumber} onChange={(e) => setNewBadgeNumber(e.target.value)} placeholder={`Aktuell: ${displayBadgeNumber(officer.badgeNumber)}`} />
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
          <Input label="Neue DN (optional)" value={newBadgeNumber} onChange={(e) => setNewBadgeNumber(e.target.value)} placeholder={`Aktuell: ${displayBadgeNumber(officer.badgeNumber)}`} />
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

      {/* Add to rank-change-list modal */}
      <Modal
        open={!!addToListModal}
        onClose={() => setAddToListModal(null)}
        title={addToListModal === 'PROMOTION' ? 'Zur Beförderungsliste hinzufügen' : 'Zur Degradierungsliste hinzufügen'}
      >
        <div className="space-y-4">
          <div className="px-3 py-2.5 bg-[#0f2340] rounded-[8px]">
            <p className="text-[13px] text-[#888]">
              Officer: <strong className="text-[#eee]">{officer.firstName} {officer.lastName}</strong>
              <span className="ml-2 text-[#999]">· Aktuell: {officer.rank?.name}</span>
            </p>
          </div>
          <Select
            label={addToListModal === 'PROMOTION' ? 'Beförderungsliste' : 'Degradierungsliste'}
            value={addToListId}
            onChange={(e) => setAddToListId(e.target.value)}
            options={(addToListModal === 'PROMOTION' ? draftPromotionLists : draftDemotionLists).map(l => ({ value: l.id, label: l.name }))}
            placeholder="Liste wählen..."
          />
          <Select
            label={addToListModal === 'PROMOTION' ? 'Neuer Rang (höher)' : 'Neuer Rang (niedriger)'}
            value={addToListRankId}
            onChange={(e) => setAddToListRankId(e.target.value)}
            options={addToListRanks.map(r => ({ value: r.id, label: r.name }))}
            placeholder="Rang wählen..."
          />
          <Input
            label="Neue DN (optional)"
            value={addToListBadgeNumber}
            onChange={(e) => setAddToListBadgeNumber(e.target.value)}
            placeholder={`Aktuell: ${displayBadgeNumber(officer.badgeNumber)}`}
          />
          <Input
            label="Notiz (optional)"
            value={addToListNote}
            onChange={(e) => setAddToListNote(e.target.value)}
            placeholder="Optional"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAddToListModal(null)}>Abbrechen</Button>
            <Button size="sm" onClick={handleAddToList} disabled={!addToListId || !addToListRankId}>
              <ListPlus size={13} strokeWidth={2} />
              Hinzufügen
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={absenceModal} onClose={() => setAbsenceModal(false)} title="Abmeldung eintragen">
        <div className="space-y-4">
          <p className="text-[13px] text-[#888]">
            Abmeldung für <strong className="text-[#eee]">{officer.firstName} {officer.lastName}</strong>.
          </p>
          <DateField
            label="Abgemeldet bis"
            value={absenceEndsAt}
            onChange={setAbsenceEndsAt}
            allowClear={false}
          />
          <Textarea
            label="Grund"
            value={absenceReason}
            onChange={(e) => setAbsenceReason(e.target.value)}
            rows={4}
            required
            placeholder="Grund der Abmeldung..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAbsenceModal(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleAddAbsence} disabled={!absenceReason.trim() || !absenceEndsAt}>
              <Send size={13} strokeWidth={2} />
              Eintragen
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!pendingTrainingOverride}
        onClose={() => setPendingTrainingOverride(null)}
        title="Ausbildung außerhalb des Mindestrangs"
      >
        {pendingTrainingOverride && (
          <div className="space-y-4">
            <div className="rounded-[10px] border border-[#d4af37]/25 bg-[#1d1608]/60 px-3.5 py-3">
              <p className="text-[13px] font-medium text-[#edf4fb]">
                {pendingTrainingOverride.training.label}
              </p>
              <p className="mt-1 text-[12.5px] text-[#9fb0c4]">
                Vorgesehen ab: {pendingTrainingOverride.training.minRank?.name ?? 'Mindestrang'}
              </p>
            </div>
            <div className="rounded-[10px] border border-[#18385f]/70 bg-[#0a1a33]/70 px-3.5 py-3">
              <p className="text-[12px] text-[#8ea4bd]">Officer</p>
              <p className="mt-1 text-[14px] font-semibold text-white">
                {officer.firstName} {officer.lastName}
              </p>
              <p className="mt-1 text-[12.5px] text-[#9fb0c4]">
                DN {displayBadgeNumber(officer.badgeNumber)} · {officer.rank.name}
              </p>
            </div>
            <p className="text-[13px] leading-relaxed text-[#9fb0c4]">
              Möchtest du diese Ausbildung wirklich exakt diesem Officer geben?
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setPendingTrainingOverride(null)}>
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const pending = pendingTrainingOverride
                  setPendingTrainingOverride(null)
                  void handleTrainingToggle(pending.training.id, pending.completed, true)
                }}
              >
                Bestätigen
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!sanctionToDelete} onClose={() => setSanctionToDelete(null)} title="Sanktion löschen">
        {sanctionToDelete && (
          <div className="space-y-4">
            <div className="rounded-[10px] border border-[#7f1d1d]/50 bg-[#2a1212]/60 px-3.5 py-3">
              <p className="text-[13px] font-semibold text-[#fca5a5]">
                {penalGradeLabel(sanctionToDelete.penalGrade)}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#c7d4e4]">
                {sanctionToDelete.reason}
              </p>
            </div>
            <p className="text-[13px] text-[#9fb0c4]">
              Diese Sanktion wird dauerhaft gelöscht.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setSanctionToDelete(null)}>
                Abbrechen
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDeleteSanction(sanctionToDelete.id)}>
                Löschen
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

const SANCTION_STATUS_CONFIG = {
  OPEN: {
    accent: 'bg-[#d97706]',
    glow: 'shadow-[0_0_0_1px_rgba(217,119,6,0.2)]',
    border: 'border-[#d97706]/25',
    bg: 'bg-[#0d0a02]',
  },
  PAID: {
    accent: 'bg-[#16a34a]',
    glow: 'shadow-[0_0_0_1px_rgba(22,163,74,0.15)]',
    border: 'border-[#16a34a]/20',
    bg: 'bg-[#020d04]',
  },
  ESCALATED: {
    accent: 'bg-[#dc2626]',
    glow: 'shadow-[0_0_0_1px_rgba(220,38,38,0.2)]',
    border: 'border-[#dc2626]/25',
    bg: 'bg-[#0d0202]',
  },
} as const

function SanctionCard({
  sanction,
  canSanction,
  variant,
  onPaid,
  onEdit,
  onEscalate,
  onDelete,
}: {
  sanction: SanctionRecord
  canSanction: boolean
  variant: 'open' | 'history'
  onPaid?: () => void
  onEdit?: () => void
  onEscalate?: () => void
  onDelete?: () => void
}) {
  const cfg = SANCTION_STATUS_CONFIG[sanction.status]
  const showActions = canSanction && (onPaid || onEdit || onEscalate || onDelete)

  return (
    <div className={cn('relative flex overflow-hidden rounded-[12px] border', cfg.border, cfg.bg, cfg.glow)}>
      {/* Left accent bar */}
      <div className={cn('w-[3.5px] shrink-0 rounded-l-[12px]', cfg.accent)} />

      <div className="flex-1 min-w-0 p-4">
        {/* Top row: grade + status + amount */}
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-[6px] bg-white/[0.04] px-2.5 py-1">
              <Gavel size={11} className="text-[#f59e0b] shrink-0" strokeWidth={2} />
              <span className="text-[12.5px] font-bold tracking-wide text-[#edf4fb]">{penalGradeLabel(sanction.penalGrade)}</span>
            </div>
            <span className={cn('rounded-full border px-2.5 py-[2px] text-[10.5px] font-semibold tracking-wide', sanctionStatusClass(sanction.status))}>
              {sanctionStatusLabel(sanction.status)}
            </span>
          </div>
          {sanction.fineAmount !== null && sanction.fineAmount > 0 && (
            <div className="flex items-baseline gap-1 rounded-[6px] bg-[#d4af37]/10 border border-[#d4af37]/20 px-2.5 py-1">
              <span className="text-[13px] font-bold tabular-nums text-[#d4af37]">
                {new Intl.NumberFormat('de-DE').format(sanction.fineAmount)}
              </span>
              <span className="text-[10px] font-medium text-[#b8973a]">$</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.05] mb-3" />

        {/* Body: penalty + reason */}
        {sanction.penalty && (
          <div className="mb-2 flex gap-2">
            <span className="mt-[2px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#94a3b8]" />
            <p className="text-[12.5px] font-medium text-[#cbd5e1] leading-relaxed">{sanction.penalty}</p>
          </div>
        )}
        <p className="text-[12.5px] leading-relaxed text-[#8ea4bd]">{sanction.reason}</p>

        {/* Footer metadata */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] text-[#4a6585]">{formatDate(sanction.createdAt)}</span>
          <span className="text-[10px] text-[#2a4a6a]">·</span>
          <span className="text-[11px] text-[#4a6585]">{sanction.issuedBy?.displayName ?? 'Gelöscht'}</span>
          <span className="text-[10px] text-[#2a4a6a]">·</span>
          <span className="text-[11px] text-[#4a6585]">{sanctionDueLabel(sanction)}</span>
        </div>

        {/* Action bar */}
        {showActions && (
          <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3.5">
            {variant === 'open' && onPaid && (
              <Button size="sm" onClick={onPaid}>
                <Check size={12} strokeWidth={2.5} /> Als bezahlt markieren
              </Button>
            )}
            {onEdit && (
              <Button variant="secondary" size="sm" onClick={onEdit}>
                <Edit size={12} strokeWidth={1.8} /> Bearbeiten
              </Button>
            )}
            {variant === 'open' && onEscalate && (
              <Button variant="secondary" size="sm" onClick={onEscalate}>
                <TrendingUp size={12} strokeWidth={1.8} /> Verdoppeln
              </Button>
            )}
            {onDelete && (
              <Button variant="danger" size="sm" onClick={onDelete}>
                <Trash2 size={12} strokeWidth={1.8} /> Löschen
              </Button>
            )}
          </div>
        )}
      </div>
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

function DutyMetric({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="rounded-[9px] border border-[#1e3a5c]/50 bg-[#0a1e38]/65 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <Timer size={13} className={active ? 'text-[#22c55e]' : 'text-[#d4af37]'} strokeWidth={1.75} />
        <p className="text-[11px] font-medium uppercase text-[#4a6585]">{label}</p>
      </div>
      <p className={cn('mt-2 text-[13px] font-semibold tabular-nums', active ? 'text-[#86efac]' : 'text-[#edf4fb]')}>{value}</p>
    </div>
  )
}

function PlaytimeChart({
  daily,
}: {
  daily: Array<{ label: string; durationMs: number; durationLabel: string }>
}) {
  const max = Math.max(...daily.map((day) => day.durationMs), 1)
  return (
    <div className="grid grid-cols-7 gap-2 h-[160px] items-end">
      {daily.map((day) => {
        const height = Math.max(8, Math.round((day.durationMs / max) * 118))
        return (
          <div key={day.label} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
            <div className="flex h-[122px] w-full items-end justify-center rounded-[7px] bg-[#061426]/55 px-1">
              <div
                className="w-full max-w-[28px] rounded-t-[6px] bg-gradient-to-t from-[#1d4ed8] to-[#38bdf8] shadow-[0_0_12px_rgba(56,189,248,0.18)]"
                style={{ height }}
                title={day.durationLabel}
              />
            </div>
            <div className="text-center">
              <p className="text-[10.5px] font-medium text-[#8ea4bd]">{day.label}</p>
              <p className="text-[10px] tabular-nums text-[#d4af37]">{day.durationLabel}</p>
            </div>
          </div>
        )
      })}
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
    { id: 'BLUE', label: 'Blau', ring: 'ring-[#38bdf8]/70', bg: 'bg-[#38bdf8]' },
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
