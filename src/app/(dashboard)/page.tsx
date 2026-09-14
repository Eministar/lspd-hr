'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import * as Tabs from '@radix-ui/react-tabs'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { cn, formatDate, formatDateTime, formatRelativeTime, getStatusDot, getStatusLabel } from '@/lib/utils'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  ChevronRight,
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
  user: { displayName: string } | null
  officer: { id: string; firstName: string; lastName: string; badgeNumber: string } | null
}

interface NotePreview {
  id: string
  title: string | null
  content: string
  createdAt: string
  updatedAt: string
  author: { displayName: string } | null
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
  notifications: Array<{
    id: string
    severity: 'info' | 'warning' | 'error'
    title: string
    description: string
    href: string
  }>
}

type StatKey = 'activeOfficers' | 'awayOfficers' | 'inactiveOfficers' | 'totalOfficers' | 'recentPromotions' | 'recentTerminations'

// Apple-Systemfarben (Dark Mode) für die Kennzahl-Punkte und die Aktivitäts-Chronik.
const SYSTEM = {
  green: '#32d74b',
  cyan: '#64d2ff',
  yellow: '#ffd60a',
  gold: '#e8c766',
  mint: '#66d4cf',
  pink: '#ff375f',
  orange: '#ff9f0a',
  red: '#ff453a',
} as const

type SystemColor = keyof typeof SYSTEM

const panelClass = 'lspd-card'
const rowClass = 'rounded-[10px] border border-line bg-white/[0.02] transition-colors duration-150 hover:bg-white/[0.045]'

const statCards: { key: StatKey; label: string; icon: LucideIcon; href: string; permission: Permission; color: SystemColor; hint: string }[] = [
  { key: 'activeOfficers', label: 'Aktive Officers', icon: UserCheck, href: '/officers', permission: 'officers:view', color: 'green', hint: 'Im aktiven Dienst' },
  { key: 'awayOfficers', label: 'Abgemeldet', icon: Clock, href: '/officers', permission: 'officers:view', color: 'cyan', hint: 'Mit Abmeldung' },
  { key: 'inactiveOfficers', label: 'Inaktiv', icon: AlertTriangle, href: '/officers', permission: 'officers:view', color: 'yellow', hint: 'Beobachtung empfohlen' },
  { key: 'totalOfficers', label: 'Gesamtbestand', icon: Users, href: '/officers', permission: 'officers:view', color: 'gold', hint: 'Alle Officers' },
  { key: 'recentPromotions', label: 'Rangänderungen', icon: TrendingUp, href: '/promotions', permission: 'rank-changes:view', color: 'mint', hint: 'Letzte Tage' },
  { key: 'recentTerminations', label: 'Kündigungen', icon: UserMinus, href: '/terminations', permission: 'terminations:view', color: 'pink', hint: 'Letzte Tage' },
]

const quickActions: { label: string; description: string; href: string; icon: LucideIcon; permission: Permission }[] = [
  { label: 'Roster prüfen', description: 'Status, Ränge & Ausbildungen', href: '/officers', icon: Users, permission: 'officers:view' },
  { label: 'Up-/D-Rank-Listen', description: 'Rangänderungen vorbereiten', href: '/promotions', icon: TrendingUp, permission: 'rank-changes:view' },
  { label: 'Notizen', description: 'Globale & personenbezogene Notizen', href: '/notes', icon: FileText, permission: 'notes:view' },
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
  INACTIVITY_NOTE_DISMISSED: 'Fehlzeit-Notiz gelöscht',
}

const activityColor: Record<string, SystemColor> = {
  OFFICER_CREATED: 'mint',
  OFFICER_UPDATED: 'cyan',
  OFFICER_DELETED: 'pink',
  OFFICER_PROMOTED: 'green',
  OFFICER_PROMOTION_REVERTED: 'yellow',
  OFFICER_TERMINATED: 'pink',
  TRAININGS_UPDATED: 'gold',
  NOTE_ADDED: 'cyan',
  INACTIVITY_NOTE_DISMISSED: 'yellow',
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-label">
          <Icon size={16} className="shrink-0 text-label-3" strokeWidth={1.75} />
          {title}
        </h3>
        {description && <p className="mt-0.5 max-w-2xl text-[12.5px] leading-relaxed text-label-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function ProgressRow({ label, value, detail, color = '#d4af37' }: { label: string; value: number; detail: string; color?: string }) {
  const width = Math.min(Math.max(value, 0), 100)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="truncate text-[13px] text-label-2">{label}</span>
        <span className="shrink-0 text-[12px] font-medium tabular-nums text-label-3">{detail}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon size={24} className="mb-2.5 text-label-4" strokeWidth={1.5} />
      <p className="text-[13px] text-label-3">{text}</p>
    </div>
  )
}

function notificationDot(severity: 'info' | 'warning' | 'error') {
  if (severity === 'error') return 'bg-red'
  if (severity === 'warning') return 'bg-yellow'
  return 'bg-blue'
}

function officerName(officer: { firstName: string; lastName: string }) {
  return `${officer.firstName} ${officer.lastName}`
}

function truncateText(text: string, length: number) {
  if (text.length <= length) return text
  return `${text.slice(0, length).trim()}…`
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

function RingProgress({ value, color = '#d4af37', size = 56, stroke = 5 }: { value: number; color?: string; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  const offset = circumference - (clamped / 100) * circumference
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgb(255 255 255 / 0.08)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[12.5px] font-semibold tabular-nums text-label">{clamped}%</span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { execute } = useApi()
  const { addToast } = useToast()
  const canViewDashboard = hasPermission(user, 'dashboard:view')
  const canManageAbsences = hasPermission(user, 'officers:write')
  const { data: stats, loading, error, refetch } = useFetch<Stats>(canViewDashboard ? '/api/stats' : null)
  const { data: absenceOfficers } = useFetch<OfficerPreview[]>(canManageAbsences ? '/api/officers' : null)
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false)
  const [absenceOfficerId, setAbsenceOfficerId] = useState('')
  const [absenceDuration, setAbsenceDuration] = useState('3')
  const [absenceEndsAt, setAbsenceEndsAt] = useState(dateAfterDays(3))
  const [absenceReason, setAbsenceReason] = useState('')
  const [absenceSubmitting, setAbsenceSubmitting] = useState(false)
  const [clock, setClock] = useState<Date | null>(null)

  useEffect(() => {
    setClock(new Date())
    const t = setInterval(() => setClock(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

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
  const timeLine = useMemo(() => {
    if (!clock) return null
    return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(clock)
  }, [clock])
  const greeting = useMemo(() => {
    const h = (clock ?? new Date()).getHours()
    if (h < 5) return 'Gute Nacht'
    if (h < 11) return 'Guten Morgen'
    if (h < 17) return 'Guten Tag'
    if (h < 22) return 'Guten Abend'
    return 'Gute Nacht'
  }, [clock])

  const absenceOfficerOptions = useMemo(() => {
    const ownOption = user?.discordId ? [{ value: '', label: 'Eigene Abmeldung' }] : []
    const officerOptions = (absenceOfficers ?? []).map((officer) => ({
      value: officer.id,
      label: `${officer.firstName} ${officer.lastName} #${displayBadgeNumber(officer.badgeNumber)}`,
    }))
    return [...ownOption, ...officerOptions]
  }, [absenceOfficers, user?.discordId])
  const canSubmitAbsence = !!absenceReason.trim() && !!absenceEndsAt && (!!user?.discordId || !!absenceOfficerId)

  const openAbsenceModal = () => {
    setAbsenceOfficerId('')
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
    if (!user?.discordId && !absenceOfficerId) {
      addToast({ type: 'error', title: 'Officer fehlt' })
      return
    }

    setAbsenceSubmitting(true)
    try {
      const payload: { reason: string; endsAt: string; officerId?: string } = {
        reason: absenceReason.trim(),
        endsAt: absenceEndsAt,
      }
      if (canManageAbsences && absenceOfficerId) payload.officerId = absenceOfficerId

      await execute('/api/absences', {
        method: 'POST',
        body: JSON.stringify(payload),
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
      <div className="mx-auto max-w-6xl">
        <div className={cn(panelClass, 'mt-6 px-6 py-16 text-center')}>
          <AlertTriangle size={28} className="mx-auto mb-3 text-red" strokeWidth={1.75} />
          <h2 className="mb-1 text-[17px] font-semibold text-label">Dashboard nicht verfügbar</h2>
          <p className="mx-auto mb-5 max-w-md text-[13.5px] text-label-2">{error || 'Die Dashboard-Daten konnten gerade nicht geladen werden.'}</p>
          <Button onClick={refetch}>
            <RefreshCw size={14} strokeWidth={2} />
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
    <div className="mx-auto max-w-7xl space-y-7 pb-4">
      <PageHeader
        className="!mb-0"
        eyebrow={`${dateLine}${timeLine ? ` · ${timeLine} Uhr` : ''}`}
        title={`${greeting}${user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.`}
        description="Dein Überblick für den heutigen Dienst."
        action={
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex h-7 items-center gap-2 rounded-full bg-green/12 px-3 text-[12.5px] font-medium text-green">
            <span className="live-pulse !h-1.5 !w-1.5" />
            {stats.dutyTimes?.activeCount ?? 0} im Dienst
          </span>
          <Button variant="ghost" onClick={refetch}><RefreshCw size={14} strokeWidth={2} />Aktualisieren</Button>
          <Button
            onClick={openAbsenceModal}
            disabled={!user?.discordId && !canManageAbsences}
            title={!user?.discordId && !canManageAbsences ? 'Dein Dashboard-User braucht eine Discord-ID.' : undefined}
          >
            <CalendarPlus size={14} strokeWidth={2} />Abmelden
          </Button>
        </div>
        }
      />

      <div className="lspd-metrics">
        {statCards.filter(card => hasPermission(user, card.permission)).map(card => (
          <Link key={card.key} href={card.href} className="lspd-metric group">
            <span className="flex items-center gap-1.5 text-[12.5px] text-label-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SYSTEM[card.color] }} aria-hidden />
              {card.label}
            </span>
            <span className="flex items-center justify-between gap-2">
              <strong className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-label tabular-nums">{stats[card.key]}</strong>
              <ArrowUpRight size={15} className="text-label-4 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={2} />
            </span>
            <span className="text-[12px] text-label-3">{card.key === 'recentPromotions' || card.key === 'recentTerminations' ? `Letzte ${stats.recentWindowDays} Tage` : card.hint}</span>
          </Link>
        ))}
      </div>

      <Tabs.Root defaultValue="overview" className="space-y-5">
        <Tabs.List aria-label="Dashboard-Bereiche" className="lspd-view-tabs">
          <Tabs.Trigger value="overview">Heute im Blick</Tabs.Trigger>
          <Tabs.Trigger value="personnel">Personal & Ausbildung</Tabs.Trigger>
          <Tabs.Trigger value="activity">Aktivitäten & Notizen</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview" className="lspd-view-enter space-y-4">
          {stats.notifications.length > 0 && (
            <section className={cn(panelClass, 'p-5')}>
              <SectionHeader
                icon={AlertTriangle}
                title="Benachrichtigungen"
                description="Hinweise aus Fristen, Ausbildung, Probezeiten und Kalender"
              />
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {stats.notifications.map((item) => (
                  <Link key={item.id} href={item.href} className={cn(rowClass, 'group flex items-start gap-3 px-4 py-3')}>
                    <span className={cn('mt-[7px] h-2 w-2 shrink-0 rounded-full', notificationDot(item.severity))} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold leading-tight text-label">{item.title}</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-label-2">{item.description}</p>
                    </div>
                    <ChevronRight size={16} className="mt-0.5 shrink-0 text-label-4 transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-label-2" strokeWidth={2} />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className={cn(panelClass, 'p-5')}>
            <SectionHeader
              icon={CalendarX}
              title="Aktuelle Abmeldungen"
              description="Entschuldigte Officers verschwinden automatisch aus Dashboard und Discord-Panel, sobald die Abmeldung endet."
            />
            {stats.activeAbsences.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {stats.activeAbsences.map((absence) => {
                  const canCancel = canManageAbsences || (!!user?.discordId && absence.officer.discordId === user.discordId)
                  return (
                    <div key={absence.id} className={cn(rowClass, 'p-4')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/officers/${absence.officer.id}`} className="text-[13.5px] font-semibold text-label transition-colors hover:text-gold-bright">
                            {officerName(absence.officer)}
                            <span className="ml-1.5 font-mono text-[12px] font-normal text-label-3">#{displayBadgeNumber(absence.officer.badgeNumber)}</span>
                          </Link>
                          <p className="mt-0.5 text-[12px] text-label-3">{absence.officer.rank.name}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-cyan/12 px-2.5 py-1 text-[12px] font-medium text-cyan">
                          bis {formatDate(absence.endsAt)}
                        </span>
                      </div>
                      <p className="mt-2.5 text-[13px] leading-relaxed text-label-2">{absence.reason}</p>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                        <span className="text-[11.5px] tabular-nums text-label-3">
                          {formatDateTime(absence.startsAt)} → {formatDateTime(absence.endsAt)}
                        </span>
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => cancelAbsence(absence.id)}
                            className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[12.5px] font-medium text-red transition-colors hover:bg-red/10"
                          >
                            <Trash2 size={13} strokeWidth={2} />
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
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <section className={cn(panelClass, 'p-5 xl:col-span-2')}>
              <SectionHeader
                icon={Activity}
                title="Operative Übersicht"
                description={`Aktuelle Lage für ${stats.currentOfficers} aktive Officers`}
              />

              <div className="mb-5 grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className={cn(rowClass, 'flex items-center gap-4 p-4 hover:bg-white/[0.02]')}>
                  <RingProgress value={stats.readinessRate} color={SYSTEM.green} />
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-label-2">Dienstbereit</p>
                    <p className="mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-label tabular-nums">{stats.activeOfficers}</p>
                    <p className="mt-0.5 text-[12px] text-label-3">{activeSummary}</p>
                  </div>
                </div>
                <div className={cn(rowClass, 'flex items-center gap-4 p-4 hover:bg-white/[0.02]')}>
                  <RingProgress value={stats.trainingCompletionRate} color="#d4af37" />
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-label-2">Ausbildung</p>
                    <p className="mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-label tabular-nums">{stats.completedTrainingAssignments}</p>
                    <p className="mt-0.5 text-[12px] text-label-3">{trainingSummary}</p>
                  </div>
                </div>
                <Link href="/promotions" className={cn(rowClass, 'group flex items-center gap-4 p-4')}>
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
                    <ListChecks size={22} className="text-label-2" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-label-2">Offene Listen</p>
                    <p className="mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-label tabular-nums">{stats.draftRankChangeLists}</p>
                    <p className="mt-0.5 text-[12px] text-label-3">Beförderungen & Degradierungen</p>
                  </div>
                  <ChevronRight size={16} className="text-label-4 transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-label-2" strokeWidth={2} />
                </Link>
              </div>

              {stats.dutyTimes && (
                <Link
                  href="/duty-times"
                  className={cn(rowClass, 'group mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between')}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-gold/15 text-gold">
                      <Clock3 size={17} strokeWidth={1.75} />
                    </div>
                    <div>
                      <p className="text-[13.5px] font-semibold text-label">Dienstzeiten</p>
                      <p className="text-[12px] text-label-3">{stats.dutyTimes.activeCount} im Dienst · {formatDuration(stats.dutyTimes.totalWeekDurationMs)} diese Woche</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-[13px] font-semibold tabular-nums text-label">
                    {formatDuration(stats.dutyTimes.totalActiveDurationMs)} aktiv
                    <ChevronRight size={16} className="text-label-4 transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-label-2" strokeWidth={2} />
                  </span>
                </Link>
              )}

              <div className="grid grid-cols-1 gap-x-8 gap-y-3.5 md:grid-cols-2">
                {stats.statusDistribution.map((status) => {
                  const percentage = stats.totalOfficers > 0 ? Math.round((status.count / stats.totalOfficers) * 100) : 0
                  const color = status.status === 'ACTIVE' ? SYSTEM.green : status.status === 'AWAY' ? SYSTEM.cyan : status.status === 'INACTIVE' ? SYSTEM.yellow : SYSTEM.red
                  return (
                    <ProgressRow
                      key={status.status}
                      label={status.label}
                      value={percentage}
                      detail={`${status.count} · ${percentage}%`}
                      color={color}
                    />
                  )
                })}
              </div>
            </section>

            <section className={cn(panelClass, 'p-5')}>
              <SectionHeader icon={ArrowUpRight} title="Schnellzugriffe" description="Direkt zu den häufigsten HR-Aufgaben" />
              <div className="-mx-2">
                {quickActions.filter((action) => hasPermission(user, action.permission)).map((action) => {
                  const Icon = action.icon
                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="group flex items-center gap-3 rounded-[10px] px-2 py-2.5 transition-colors hover:bg-white/[0.045]"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.06] text-label-2">
                        <Icon size={16} strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-label">{action.label}</p>
                        <p className="truncate text-[12px] text-label-3">{action.description}</p>
                      </div>
                      <ChevronRight size={16} className="text-label-4 transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-label-2" strokeWidth={2} />
                    </Link>
                  )
                })}
              </div>
            </section>
          </div>
        </Tabs.Content>

        <Tabs.Content value="personnel" className="lspd-view-enter space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <section className={cn(panelClass, 'p-5 xl:col-span-3')}>
              <SectionHeader icon={ClipboardCheck} title="Ausbildungsstand" description="Abdeckung pro Ausbildung über alle aktiven Officers" />
              {stats.trainingBreakdown.length > 0 ? (
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
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
            </section>

            <section className={cn(panelClass, 'p-5 xl:col-span-2')}>
              <SectionHeader icon={AlertTriangle} title="HR-Fokus" description="Abgemeldete und inaktive Officers" />
              {stats.attentionOfficers.length > 0 ? (
                <div className="-mx-2 divide-y divide-line">
                  {stats.attentionOfficers.map((officer) => (
                    <Link
                      key={officer.id}
                      href={`/officers/${officer.id}`}
                      className="flex items-center justify-between gap-3 rounded-[8px] px-2 py-2.5 transition-colors hover:bg-white/[0.045]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-label">
                          {officerName(officer)}
                          <span className="ml-1.5 font-mono text-[12px] font-normal text-label-3">#{displayBadgeNumber(officer.badgeNumber)}</span>
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-label-3">
                          {officer.rank.name} · {officer.lastOnline ? `zuletzt online ${formatRelativeTime(officer.lastOnline)}` : `aktualisiert ${formatDate(officer.updatedAt)}`}
                        </p>
                      </div>
                      {officer.status && (
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-label-2">
                          <span className={cn('h-1.5 w-1.5 rounded-full', getStatusDot(officer.status))} />
                          {getStatusLabel(officer.status)}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState icon={UserCheck} text="Keine abgemeldeten oder inaktiven Officers" />
              )}
            </section>
          </div>

          {visibleRankDistribution.length > 0 && (
            <section className={cn(panelClass, 'p-5')}>
              <SectionHeader icon={Users} title="Rangverteilung" description="Aktive Officers nach Rang" />
              <div className="space-y-2">
                {visibleRankDistribution.map((rank) => {
                  const percentage = (rank.count / topRankCount) * 100
                  return (
                    <div key={rank.rank} className="flex items-center gap-3">
                      <div className="w-36 truncate text-[13px] text-label-2 sm:w-44">{rank.rank}</div>
                      <div className="h-[22px] flex-1 overflow-hidden rounded-[6px] bg-white/[0.04]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
                          className="flex h-full items-center justify-end rounded-[6px] pr-2"
                          style={{ minWidth: rank.count > 0 ? '1.75rem' : 0, backgroundColor: rank.color }}
                        >
                          <span className="text-[11px] font-semibold tabular-nums text-label drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{rank.count}</span>
                        </motion.div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </Tabs.Content>

        <Tabs.Content value="activity" className="lspd-view-enter space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <section className={cn(panelClass, 'p-5 xl:col-span-3')}>
              <SectionHeader
                icon={ScrollText}
                title="Aktuelle Aktivitäten"
                description="Letzte Änderungen im Systemprotokoll"
                action={
                  hasPermission(user, 'logs:view') ? (
                    <Link href="/logs" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-gold-bright transition-colors hover:text-gold-bright">
                      Alle ansehen
                      <ChevronRight size={14} strokeWidth={2} />
                    </Link>
                  ) : null
                }
              />
              {stats.recentActivity.length > 0 ? (
                <div className="relative">
                  <div className="absolute bottom-3 left-[15px] top-3 w-px bg-line" aria-hidden />
                  <div className="space-y-4">
                    {stats.recentActivity.map((entry) => {
                      const label = actionLabels[entry.action] || entry.action
                      const color = SYSTEM[activityColor[entry.action] ?? 'gold']
                      return (
                        <div key={entry.id} className="relative flex items-start gap-3.5">
                          <div
                            className="relative z-10 flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full bg-surface-3 shadow-[0_0_0_4px_var(--color-surface)]"
                            style={{ color }}
                          >
                            <Activity size={14} strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1 pt-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-[13.5px] font-semibold text-label">{label}</span>
                              {entry.officer && (
                                <Link href={`/officers/${entry.officer.id}`} className="text-[13px] text-label-2 transition-colors hover:text-gold-bright">
                                  {officerName(entry.officer)} <span className="font-mono text-[12px] text-label-3">#{displayBadgeNumber(entry.officer.badgeNumber)}</span>
                                </Link>
                              )}
                            </div>
                            {entry.details && <p className="mt-0.5 text-[12.5px] text-label-2">{entry.details}</p>}
                            {entry.oldValue && entry.newValue && (
                              <p className="mt-0.5 text-[12px] text-label-3">
                                <span className="line-through opacity-70">{entry.oldValue}</span>
                                <span className="mx-1.5 text-label-4">→</span>
                                <span className="text-label-2">{entry.newValue}</span>
                              </p>
                            )}
                            <p className="mt-1 text-[11.5px] tabular-nums text-label-3">
                              {entry.user?.displayName ?? 'Gelöscht'} · {formatRelativeTime(entry.createdAt)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <EmptyState icon={ScrollText} text="Keine Aktivitäten vorhanden" />
              )}
            </section>

            <div className="space-y-4 xl:col-span-2">
              <section className={cn(panelClass, 'p-5')}>
                <SectionHeader icon={Pin} title="Angepinnte Notizen" description="Wichtige Hinweise für HR & Führung" />
                {stats.pinnedNotes.length > 0 ? (
                  <div className="space-y-2">
                    {stats.pinnedNotes.map((note) => (
                      <Link
                        key={note.id}
                        href={note.officer ? `/officers/${note.officer.id}` : '/notes'}
                        className={cn(rowClass, 'block px-3.5 py-3')}
                      >
                        <p className="text-[13.5px] font-semibold text-label">{note.title || 'Notiz'}</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-label-2">{truncateText(note.content, 120)}</p>
                        <p className="mt-2 text-[11.5px] text-label-3">
                          {note.officer ? `${officerName(note.officer)} · ` : ''}{note.author?.displayName ?? 'Gelöscht'}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={FileText} text="Keine angepinnten Notizen" />
                )}
              </section>

              <section className={cn(panelClass, 'p-5')}>
                <SectionHeader icon={CalendarDays} title="Neue Officers" description="Zuletzt eingestellte Mitarbeiter" />
                {stats.recentHires.length > 0 ? (
                  <div className="-mx-2 divide-y divide-line">
                    {stats.recentHires.map((officer) => (
                      <Link
                        key={officer.id}
                        href={`/officers/${officer.id}`}
                        className="flex items-center justify-between gap-3 rounded-[8px] px-2 py-2.5 transition-colors hover:bg-white/[0.045]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium text-label">{officerName(officer)}</p>
                          <p className="mt-0.5 truncate text-[12px] text-label-3">{officer.rank.name}</p>
                        </div>
                        <span className="shrink-0 text-[12px] tabular-nums text-label-2">{formatDate(officer.hireDate)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={Users} text="Keine Officers vorhanden" />
                )}
              </section>
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>

      <Modal open={absenceModalOpen} onClose={() => setAbsenceModalOpen(false)} title="Abmeldung eintragen" description="Trage eine Abwesenheit ein – sie endet automatisch zum gewählten Datum.">
        <div className="space-y-4">
          {canManageAbsences && (
            <Select
              label="Officer"
              value={absenceOfficerId}
              onValueChange={setAbsenceOfficerId}
              options={absenceOfficerOptions}
              placeholder={user?.discordId ? 'Eigene Abmeldung oder Officer wählen' : 'Officer wählen...'}
            />
          )}
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
          {!user?.discordId && !canManageAbsences && (
            <p className="rounded-[10px] bg-yellow/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-yellow">
              Dein Dashboard-User braucht eine Discord-ID, damit die Abmeldung deinem Officer zugeordnet werden kann.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setAbsenceModalOpen(false)}>Abbrechen</Button>
            <Button onClick={submitAbsence} loading={absenceSubmitting} disabled={!canSubmitAbsence}>
              <Send size={14} strokeWidth={2} />
              Eintragen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
