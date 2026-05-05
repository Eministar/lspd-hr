'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { cn, formatDate, formatDateTime, getStatusDot, getStatusLabel } from '@/lib/utils'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  ClipboardCheck,
  Clock,
  Clock3,
  FileText,
  GraduationCap,
  ListChecks,
  Pin,
  RefreshCw,
  ScrollText,
  Send,
  TrendingDown,
  TrendingUp,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '@/context/auth-context'
import { hasPermission, type Permission } from '@/lib/permissions'
import { displayBadgeNumber } from '@/lib/badge-number'
import { notifyLiveUpdate } from '@/lib/live-updates'

interface RankSummary {
  name: string
  color: string
  sortOrder: number
}

interface OfficerPreview {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  status?: string
  hireDate?: string
  lastOnline?: string | null
  updatedAt?: string
  rank: RankSummary
}

interface ActivityItem {
  id: string
  action: string
  oldValue: string | null
  newValue: string | null
  details: string | null
  createdAt: string
  user: { displayName: string }
  officer: { id: string; firstName: string; lastName: string; badgeNumber: string } | null
}

interface NotePreview {
  id: string
  title: string | null
  content: string
  createdAt: string
  updatedAt: string
  author: { displayName: string }
  officer: { id: string; firstName: string; lastName: string; badgeNumber: string } | null
}

interface ActiveAbsence {
  id: string
  startsAt: string
  endsAt: string
  reason: string
  source: string
  officer: {
    id: string
    badgeNumber: string
    firstName: string
    lastName: string
    discordId: string | null
    rank: RankSummary
  }
}

interface Stats {
  totalOfficers: number
  activeOfficers: number
  awayOfficers: number
  inactiveOfficers: number
  terminatedOfficers: number
  currentOfficers: number
  totalPromotions: number
  recentPromotions: number
  recentTerminations: number
  readinessRate: number
  totalTrainingAssignments: number
  completedTrainingAssignments: number
  trainingCompletionRate: number
  draftRankChangeLists: number
  dutyTimes: {
    activeCount: number
    totalActiveDurationMs: number
    totalWeekDurationMs: number
    activeRows: Array<{
      id: string
      badgeNumber: string
      firstName: string
      lastName: string
      rank: { name: string; color: string; sortOrder: number }
      activeSession: { id: string; clockInAt: string; currentDurationMs: number } | null
      weekDurationMs: number
    }>
  } | null
  activeAbsences: ActiveAbsence[]
  recentWindowDays: number
  rankDistribution: { rank: string; color: string; count: number }[]
  statusDistribution: { status: string; label: string; count: number }[]
  trainingBreakdown: { id: string; label: string; completed: number; total: number; percentage: number }[]
  attentionOfficers: OfficerPreview[]
  recentHires: OfficerPreview[]
  recentActivity: ActivityItem[]
  pinnedNotes: NotePreview[]
}

type StatKey = 'activeOfficers' | 'awayOfficers' | 'inactiveOfficers' | 'totalOfficers' | 'recentPromotions' | 'recentTerminations'

const panelClass =
  'glass-panel-elevated rounded-[15px] p-5 border border-[#1e3a5c]/40 shadow-sm shadow-black/10'
const surfaceClass = 'glass-panel rounded-[10px] border border-white/[0.04]'

const statCards: { key: StatKey; label: string; icon: LucideIcon; href: string; permission: Permission }[] = [
  { key: 'activeOfficers', label: 'Aktive Officers', icon: UserCheck, href: '/officers', permission: 'officers:view' },
  { key: 'awayOfficers', label: 'Abgemeldet', icon: Clock, href: '/officers', permission: 'officers:view' },
  { key: 'inactiveOfficers', label: 'Inaktiv', icon: AlertTriangle, href: '/officers', permission: 'officers:view' },
  { key: 'totalOfficers', label: 'Gesamt', icon: Users, href: '/officers', permission: 'officers:view' },
  { key: 'recentPromotions', label: 'Beförderungen', icon: TrendingUp, href: '/promotions', permission: 'rank-changes:view' },
  { key: 'recentTerminations', label: 'Kündigungen', icon: UserMinus, href: '/terminations', permission: 'terminations:view' },
]

const quickActions: { label: string; description: string; href: string; icon: LucideIcon; permission: Permission }[] = [
  { label: 'Roster prüfen', description: 'Status, Ränge und Ausbildungen kontrollieren', href: '/officers', icon: Users, permission: 'officers:view' },
  { label: 'Beförderungen', description: 'Beförderungslisten prüfen', href: '/promotions', icon: TrendingUp, permission: 'rank-changes:view' },
  { label: 'Degradierungen', description: 'Degradierungslisten prüfen', href: '/demotions', icon: TrendingDown, permission: 'rank-changes:view' },
  { label: 'Notizen', description: 'Globale und personenbezogene Notizen verwalten', href: '/notes', icon: FileText, permission: 'notes:view' },
]

const actionLabels: Record<string, string> = {
  OFFICER_CREATED: 'Officer erstellt',
  OFFICER_UPDATED: 'Officer bearbeitet',
  OFFICER_DELETED: 'Officer gelöscht',
  OFFICER_PROMOTED: 'Beförderung',
  OFFICER_PROMOTION_REVERTED: 'Beförderung rückgängig',
  OFFICER_TERMINATED: 'Kündigung',
  TRAININGS_UPDATED: 'Ausbildung aktualisiert',
  NOTE_ADDED: 'Notiz hinzugefügt',
}

function SectionTitle({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#d4af37]/8 border border-[#d4af37]/15">
            <Icon size={14} className="text-[#d4af37]" strokeWidth={1.75} />
          </span>
          <h3 className="text-[13.5px] font-semibold text-[#f7fbff] tracking-[-0.01em]">{title}</h3>
        </div>
        {description && <p className="text-[12px] text-[#7d94b0] mt-1.5 max-w-2xl leading-relaxed">{description}</p>}
      </div>
    </div>
  )
}

function ProgressRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  const width = Math.min(Math.max(value, 0), 100)

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-[12.5px] text-[#b7c5d8]">{label}</span>
        <span className="text-[12px] text-[#d4af37] tabular-nums font-medium">{detail}</span>
      </div>
      <div className="h-[7px] bg-[#102542]/80 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="h-full bg-gradient-to-r from-[#d4af37] to-[#c9a52f] rounded-full shadow-[0_0_6px_rgba(212,175,55,0.2)]"
        />
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Icon size={24} className="text-[#d4af37]/30 mb-2.5" strokeWidth={1.5} />
      <p className="text-[12.5px] text-[#8ea4bd]">{text}</p>
    </div>
  )
}

function officerName(officer: { firstName: string; lastName: string }) {
  return `${officer.firstName} ${officer.lastName}`
}

function truncateText(text: string, length: number) {
  if (text.length <= length) return text
  return `${text.slice(0, length).trim()}...`
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
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

export default function DashboardPage() {
  const { user } = useAuth()
  const { execute } = useApi()
  const { addToast } = useToast()
  const canViewDashboard = hasPermission(user, 'dashboard:view')
  const canManageAbsences = hasPermission(user, 'officers:write')
  const { data: stats, loading, error, refetch } = useFetch<Stats>(canViewDashboard ? '/api/stats' : null)
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false)
  const [absenceDuration, setAbsenceDuration] = useState('3')
  const [absenceEndsAt, setAbsenceEndsAt] = useState(dateAfterDays(3))
  const [absenceReason, setAbsenceReason] = useState('')
  const [absenceSubmitting, setAbsenceSubmitting] = useState(false)
  const dateLine = useMemo(
    () =>
      new Intl.DateTimeFormat('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    []
  )

  const openAbsenceModal = () => {
    setAbsenceDuration('3')
    setAbsenceEndsAt(dateAfterDays(3))
    setAbsenceReason('')
    setAbsenceModalOpen(true)
  }

  const updateAbsenceDuration = (value: string) => {
    setAbsenceDuration(value)
    const days = Number.parseInt(value, 10)
    if (Number.isFinite(days) && days > 0) setAbsenceEndsAt(dateAfterDays(days))
  }

  const submitAbsence = async () => {
    if (!absenceReason.trim()) {
      addToast({ type: 'error', title: 'Grund fehlt' })
      return
    }

    setAbsenceSubmitting(true)
    try {
      await execute('/api/absences', {
        method: 'POST',
        body: JSON.stringify({
          reason: absenceReason.trim(),
          endsAt: absenceEndsAt,
        }),
      })
      addToast({ type: 'success', title: 'Abmeldung eingetragen' })
      setAbsenceModalOpen(false)
      notifyLiveUpdate()
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Abmeldung fehlgeschlagen', message: err instanceof Error ? err.message : '' })
    } finally {
      setAbsenceSubmitting(false)
    }
  }

  const cancelAbsence = async (absenceId: string) => {
    try {
      await execute(`/api/absences/${absenceId}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Abmeldung beendet' })
      notifyLiveUpdate()
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Abmeldung konnte nicht beendet werden', message: err instanceof Error ? err.message : '' })
    }
  }

  if (!canViewDashboard) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  if (error || !stats) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Dashboard" description="Übersicht der Personalverwaltung" />
        <div className={cn(panelClass, 'text-center py-16')}>
          <AlertTriangle size={28} className="mx-auto text-[#f87171] mb-3" strokeWidth={1.5} />
          <p className="text-[13px] text-[#9fb0c4] mb-4">{error || 'Dashboard-Daten konnten nicht geladen werden'}</p>
          <Button size="sm" onClick={refetch}>
            <RefreshCw size={13} strokeWidth={2} />
            Erneut laden
          </Button>
        </div>
      </div>
    )
  }

  const visibleRankDistribution = stats.rankDistribution.filter((rank) => rank.count > 0)
  const topRankCount = Math.max(...visibleRankDistribution.map((rank) => rank.count), 1)
  const trainingSummary = stats.totalTrainingAssignments > 0
    ? `${stats.completedTrainingAssignments} von ${stats.totalTrainingAssignments} erledigt`
    : 'Keine Ausbildungen zugewiesen'
  const activeSummary = stats.currentOfficers > 0
    ? `${stats.activeOfficers} von ${stats.currentOfficers} einsatzbereit`
    : 'Keine laufenden Officers'

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-2">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5 min-w-0">
            <h1 className="text-[22px] sm:text-[23px] font-semibold text-white tracking-[-0.02em]">Dashboard</h1>
            <p className="text-[13px] text-[#8ea4bd]">Personalstand, Ausbildungen und letzte Vorgänge im Blick</p>
            <p className="text-[10.5px] font-medium text-[#4a6585] uppercase tracking-[0.16em] pt-0.5">{dateLine}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={refetch} className="shrink-0 w-fit">
              <RefreshCw size={13} strokeWidth={2} />
              Aktualisieren
            </Button>
            <Button
              size="sm"
              onClick={openAbsenceModal}
              disabled={!user?.discordId}
              title={!user?.discordId ? 'Dein Dashboard-User braucht eine Discord-ID.' : undefined}
            >
              <CalendarPlus size={13} strokeWidth={2} />
              Abmelden
            </Button>
          </div>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#d4af37]/18 to-transparent" />
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
        {statCards.filter((card) => hasPermission(user, card.permission)).map((card, i) => {
          const Icon = card.icon
          const label = card.key === 'recentPromotions' || card.key === 'recentTerminations'
            ? `${card.label} (${stats.recentWindowDays}T)`
            : card.label
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
            >
              <Link
                href={card.href}
                className="group glass-panel-elevated rounded-[14px] p-4 flex items-center gap-3.5 border border-white/[0.04] transition-all duration-200 hover:border-[#d4af37]/20 hover:shadow-[0_4px_20px_rgba(0,0,0,0.18)]"
              >
                <div className="icon-tile h-10 w-10 rounded-[10px] flex items-center justify-center group-hover:ring-1 group-hover:ring-[#d4af37]/15 transition-[box-shadow,ring]">
                  <Icon size={18} strokeWidth={1.85} />
                </div>
                <div className="min-w-0">
                  <p className="text-[22px] font-semibold text-white tabular-nums leading-tight">{stats[card.key]}</p>
                  <p className="text-[11.5px] text-[#8ea4bd] mt-0.5">{label}</p>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
        className={panelClass}
      >
        <SectionTitle
          icon={CalendarX}
          title="Aktuelle Abmeldungen"
          description="Entschuldigte Officers verschwinden automatisch aus Dashboard und Discord-Panel, sobald die Abmeldung endet."
        />
        {stats.activeAbsences.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {stats.activeAbsences.map((absence) => {
              const canCancel = canManageAbsences || (!!user?.discordId && absence.officer.discordId === user.discordId)
              return (
                <div key={absence.id} className={cn(surfaceClass, 'p-3.5')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/officers/${absence.officer.id}`} className="text-[13px] font-semibold text-white hover:text-[#d4af37] transition-colors">
                        {officerName(absence.officer)}
                        <span className="ml-1 font-mono text-[#d4af37]">#{displayBadgeNumber(absence.officer.badgeNumber)}</span>
                      </Link>
                      <p className="text-[11.5px] text-[#8ea4bd] mt-0.5">{absence.officer.rank.name}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-[#38bdf8]/25 bg-[#06233a]/60 px-2.5 py-1 text-[11.5px] text-[#93c5fd]">
                      bis {formatDate(absence.endsAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#c7d4e4]">{absence.reason}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#6b8299]">
                      {formatDateTime(absence.startsAt)} → {formatDateTime(absence.endsAt)}
                    </span>
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => cancelAbsence(absence.id)}
                        className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[11.5px] text-[#fca5a5] transition-colors hover:bg-[#321218]/50"
                      >
                        <Trash2 size={12} strokeWidth={1.85} />
                        Beenden
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={CalendarDays} text="Aktuell ist niemand abgemeldet" />
        )}
      </motion.section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
          className={cn(panelClass, 'xl:col-span-2')}
        >
          <SectionTitle icon={Activity} title="Operative Übersicht" description={`Aktuelle Lage für ${stats.currentOfficers} nicht gekündigte Officers`} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <div className={cn(surfaceClass, 'p-4')}>
              <div className="flex items-center gap-2 mb-3">
                <UserCheck size={14} className="text-[#d4af37]" strokeWidth={1.75} />
                <span className="text-[12px] font-medium text-[#b7c5d8]">Dienstbereitschaft</span>
              </div>
              <p className="text-[28px] font-semibold text-white tabular-nums leading-none">{stats.readinessRate}%</p>
              <p className="text-[12px] text-[#9fb0c4] mt-2">{activeSummary}</p>
            </div>
            <div className={cn(surfaceClass, 'p-4')}>
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap size={14} className="text-[#d4af37]" strokeWidth={1.75} />
                <span className="text-[12px] font-medium text-[#b7c5d8]">Ausbildungsquote</span>
              </div>
              <p className="text-[28px] font-semibold text-white tabular-nums leading-none">{stats.trainingCompletionRate}%</p>
              <p className="text-[12px] text-[#9fb0c4] mt-2">{trainingSummary}</p>
            </div>
            <div className={cn(surfaceClass, 'p-4')}>
              <div className="flex items-center gap-2 mb-3">
                <ListChecks size={14} className="text-[#d4af37]" strokeWidth={1.75} />
                <span className="text-[12px] font-medium text-[#b7c5d8]">Offene Listen</span>
              </div>
              <p className="text-[28px] font-semibold text-white tabular-nums leading-none">{stats.draftRankChangeLists}</p>
              <p className="text-[12px] text-[#9fb0c4] mt-2">Beförderungs- oder Degradierungslisten</p>
            </div>
          </div>

          {stats.dutyTimes && (
            <Link
              href="/duty-times"
              className={cn(surfaceClass, 'mb-5 flex flex-col gap-3 p-4 transition-all duration-200 hover:border-[#d4af37]/20 sm:flex-row sm:items-center sm:justify-between')}
            >
              <div className="flex items-center gap-3">
                <div className="icon-tile h-9 w-9 rounded-[9px] flex items-center justify-center">
                  <Clock3 size={16} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">Dienstzeiten</p>
                  <p className="text-[11.5px] text-[#9fb0c4]">{stats.dutyTimes.activeCount} eingestempelt · {formatDuration(stats.dutyTimes.totalWeekDurationMs)} diese Woche</p>
                </div>
              </div>
              <span className="text-[12.5px] font-semibold tabular-nums text-[#d4af37]">
                {formatDuration(stats.dutyTimes.totalActiveDurationMs)} aktiv
              </span>
            </Link>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {stats.statusDistribution.map((status) => {
              const percentage = stats.totalOfficers > 0 ? Math.round((status.count / stats.totalOfficers) * 100) : 0
              return (
                <ProgressRow
                  key={status.status}
                  label={status.label}
                  value={percentage}
                  detail={`${status.count} · ${percentage}%`}
                />
              )
            })}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.16 }}
          className={panelClass}
        >
          <SectionTitle icon={ArrowUpRight} title="Schnellzugriffe" description="Direkt zu den häufigsten HR-Aufgaben" />
          <div className="space-y-2">
            {quickActions.filter((action) => hasPermission(user, action.permission)).map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={cn('flex items-center gap-3 px-3.5 py-3 hover:shadow-[0_2px_8px_rgba(212,175,55,0.06)] transition-all duration-200', surfaceClass)}
                >
                  <div className="icon-tile h-8 w-8 rounded-[8px] flex items-center justify-center">
                    <Icon size={15} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white">{action.label}</p>
                    <p className="text-[11.5px] text-[#9fb0c4] truncate">{action.description}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </motion.section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className={cn(panelClass, 'xl:col-span-3')}
        >
          <SectionTitle icon={ClipboardCheck} title="Ausbildungsstand" description="Abdeckung pro Ausbildung über alle nicht gekündigten Officers" />
          {stats.trainingBreakdown.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
              {stats.trainingBreakdown.map((training) => (
                <ProgressRow
                  key={training.id}
                  label={training.label}
                  value={training.percentage}
                  detail={`${training.completed}/${training.total} · ${training.percentage}%`}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={GraduationCap} text="Keine Ausbildungen konfiguriert" />
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.24 }}
          className={cn(panelClass, 'xl:col-span-2')}
        >
          <SectionTitle icon={AlertTriangle} title="HR-Fokus" description="Abgemeldete und inaktive Officers" />
          {stats.attentionOfficers.length > 0 ? (
            <div className="space-y-2">
              {stats.attentionOfficers.map((officer) => (
                <Link
                  key={officer.id}
                  href={`/officers/${officer.id}`}
                  className={cn('flex items-center justify-between gap-3 px-3.5 py-3 hover:shadow-[0_2px_8px_rgba(212,175,55,0.06)] transition-all duration-200', surfaceClass)}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">
                      {officerName(officer)}
                      <span className="text-[#d4af37] font-mono ml-1">#{displayBadgeNumber(officer.badgeNumber)}</span>
                    </p>
                    <p className="text-[11.5px] text-[#9fb0c4] truncate">
                      {officer.rank.name} · {officer.lastOnline ? `zuletzt online ${formatDate(officer.lastOnline)}` : `aktualisiert ${formatDate(officer.updatedAt)}`}
                    </p>
                  </div>
                  {officer.status && (
                    <span className="inline-flex items-center gap-1.5 shrink-0 text-[11.5px] text-[#b7c5d8]">
                      <span className={cn('h-[6px] w-[6px] rounded-full', getStatusDot(officer.status))} />
                      {getStatusLabel(officer.status)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={UserCheck} text="Keine abgemeldeten oder inaktiven Officers" />
          )}
        </motion.section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.28 }}
          className={cn(panelClass, 'xl:col-span-3')}
        >
          <SectionTitle icon={ScrollText} title="Aktuelle Aktivitäten" description="Letzte Änderungen im Systemprotokoll" />
          {stats.recentActivity.length > 0 ? (
            <div className="divide-y divide-[#d4af37]/10">
              {stats.recentActivity.map((entry) => {
                const label = actionLabels[entry.action] || entry.action
                return (
                  <div key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="icon-tile h-8 w-8 rounded-[8px] flex items-center justify-center shrink-0">
                      <Activity size={14} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[12px] font-medium text-white">{label}</span>
                        {entry.officer && (
                          <Link href={`/officers/${entry.officer.id}`} className="text-[12px] text-[#d4af37] hover:text-white transition-colors">
                            {officerName(entry.officer)} #{displayBadgeNumber(entry.officer.badgeNumber)}
                          </Link>
                        )}
                      </div>
                      {entry.details && <p className="text-[12px] text-[#b7c5d8] mt-0.5">{entry.details}</p>}
                      {entry.oldValue && entry.newValue && (
                        <p className="text-[11.5px] text-[#7089a5] mt-0.5">{entry.oldValue} → {entry.newValue}</p>
                      )}
                      <p className="text-[11px] text-[#7089a5] mt-1">
                        {entry.user.displayName} · {formatDateTime(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState icon={ScrollText} text="Keine Aktivitäten vorhanden" />
          )}
        </motion.section>

        <div className="xl:col-span-2 space-y-4">
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.32 }}
            className={panelClass}
          >
            <SectionTitle icon={Pin} title="Angepinnte Notizen" description="Wichtige Hinweise für HR und Führung" />
            {stats.pinnedNotes.length > 0 ? (
              <div className="space-y-2">
                {stats.pinnedNotes.map((note) => (
                  <Link
                    key={note.id}
                    href={note.officer ? `/officers/${note.officer.id}` : '/notes'}
                    className={cn('block px-3.5 py-3 hover:shadow-[0_2px_8px_rgba(212,175,55,0.06)] transition-all duration-200', surfaceClass)}
                  >
                    <p className="text-[13px] font-medium text-white">{note.title || 'Notiz'}</p>
                    <p className="text-[12px] text-[#b7c5d8] mt-1 leading-relaxed">{truncateText(note.content, 120)}</p>
                    <p className="text-[11px] text-[#d4af37] mt-2">
                      {note.officer ? `${officerName(note.officer)} · ` : ''}{note.author.displayName}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={FileText} text="Keine angepinnten Notizen" />
            )}
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.36 }}
            className={panelClass}
          >
            <SectionTitle icon={CalendarDays} title="Neue Officers" description="Zuletzt eingestellte Mitarbeiter" />
            {stats.recentHires.length > 0 ? (
              <div className="space-y-2">
                {stats.recentHires.map((officer) => (
                  <Link
                    key={officer.id}
                    href={`/officers/${officer.id}`}
                    className={cn('flex items-center justify-between gap-3 px-3.5 py-3 hover:shadow-[0_2px_8px_rgba(212,175,55,0.06)] transition-all duration-200', surfaceClass)}
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-white truncate">
                        {officerName(officer)}
                      </p>
                      <p className="text-[11.5px] text-[#9fb0c4] truncate">{officer.rank.name}</p>
                    </div>
                    <span className="text-[11.5px] text-[#d4af37] shrink-0 font-medium">{formatDate(officer.hireDate)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={Users} text="Keine Officers vorhanden" />
            )}
          </motion.section>
        </div>
      </div>

      {visibleRankDistribution.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.4 }}
          className={panelClass}
        >
          <SectionTitle icon={Users} title="Rangverteilung" description="Nicht gekündigte Officers nach Rang" />
          <div className="space-y-2.5">
            {visibleRankDistribution.map((rank) => {
              const percentage = (rank.count / topRankCount) * 100
              return (
                <div key={rank.rank} className="flex items-center gap-3">
                  <div className="w-40 text-[13px] text-[#b7c5d8] truncate">{rank.rank}</div>
                  <div className="flex-1 h-[22px] bg-[#102542]/60 rounded-[6px] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.6, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-[6px] flex items-center justify-end pr-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                      style={{ minWidth: rank.count > 0 ? '1.5rem' : 0, backgroundColor: rank.color }}
                    >
                      <span className="text-[10px] font-semibold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">{rank.count}</span>
                    </motion.div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.section>
      )}

      <Modal open={absenceModalOpen} onClose={() => setAbsenceModalOpen(false)} title="Abmeldung eintragen">
        <div className="space-y-4">
          <Select
            label="Dauer"
            value={absenceDuration}
            onValueChange={updateAbsenceDuration}
            options={[
              { value: '1', label: '1 Tag' },
              { value: '2', label: '2 Tage' },
              { value: '3', label: '3 Tage' },
              { value: '5', label: '5 Tage' },
              { value: '7', label: '1 Woche' },
              { value: '14', label: '2 Wochen' },
            ]}
          />
          <DateField
            label="Abgemeldet bis"
            value={absenceEndsAt}
            onChange={(value) => {
              setAbsenceDuration('')
              setAbsenceEndsAt(value)
            }}
            allowClear={false}
          />
          <Textarea
            label="Grund"
            value={absenceReason}
            onChange={(event) => setAbsenceReason(event.target.value)}
            rows={4}
            placeholder="Grund der Abmeldung..."
            required
          />
          {!user?.discordId && (
            <p className="rounded-[9px] border border-[#3d2d12] bg-[#1d1608] px-3 py-2 text-[12px] text-[#e8c979]">
              Dein Dashboard-User braucht eine Discord-ID, damit die Abmeldung deinem Officer zugeordnet werden kann.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setAbsenceModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={submitAbsence} loading={absenceSubmitting} disabled={!absenceReason.trim() || !absenceEndsAt || !user?.discordId}>
              <Send size={13} strokeWidth={2} />
              Eintragen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
