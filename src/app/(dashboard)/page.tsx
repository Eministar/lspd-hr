'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
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
  ArrowRight,
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
  Sparkles,
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

type AccentKey = 'emerald' | 'sky' | 'amber' | 'gold' | 'mint' | 'rose'

interface AccentTokens {
  text: string
  bg: string
  ring: string
  glow: string
}

const ACCENTS: Record<AccentKey, AccentTokens> = {
  emerald: { text: '#34d399', bg: 'rgba(52,211,153,0.10)', ring: 'rgba(52,211,153,0.28)', glow: 'rgba(52,211,153,0.20)' },
  sky: { text: '#7dd3fc', bg: 'rgba(56,189,248,0.10)', ring: 'rgba(56,189,248,0.28)', glow: 'rgba(56,189,248,0.18)' },
  amber: { text: '#fbbf24', bg: 'rgba(251,191,36,0.10)', ring: 'rgba(251,191,36,0.28)', glow: 'rgba(251,191,36,0.18)' },
  gold: { text: '#f0d060', bg: 'rgba(212,175,55,0.10)', ring: 'rgba(212,175,55,0.30)', glow: 'rgba(212,175,55,0.22)' },
  mint: { text: '#5eead4', bg: 'rgba(94,234,212,0.10)', ring: 'rgba(94,234,212,0.28)', glow: 'rgba(94,234,212,0.20)' },
  rose: { text: '#fda4af', bg: 'rgba(244,114,182,0.10)', ring: 'rgba(244,114,182,0.30)', glow: 'rgba(244,114,182,0.20)' },
}

const panelClass = 'rounded-[16px] border border-[#1a3559]/55 bg-[#091e36]/70 backdrop-blur-md shadow-[0_1px_2px_rgba(0,0,0,0.12),0_8px_28px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(212,175,55,0.04)]'
const surfaceClass = 'rounded-[12px] border border-white/[0.05] bg-[#0a2240]/55'

const statCards: { key: StatKey; label: string; icon: LucideIcon; href: string; permission: Permission; accent: AccentKey; hint: string }[] = [
  { key: 'activeOfficers', label: 'Aktive Officers', icon: UserCheck, href: '/officers', permission: 'officers:view', accent: 'emerald', hint: 'Im aktiven Dienst' },
  { key: 'awayOfficers', label: 'Abgemeldet', icon: Clock, href: '/officers', permission: 'officers:view', accent: 'sky', hint: 'Mit Abmeldung' },
  { key: 'inactiveOfficers', label: 'Inaktiv', icon: AlertTriangle, href: '/officers', permission: 'officers:view', accent: 'amber', hint: 'Beobachtung empfohlen' },
  { key: 'totalOfficers', label: 'Gesamtbestand', icon: Users, href: '/officers', permission: 'officers:view', accent: 'gold', hint: 'Alle Officers' },
  { key: 'recentPromotions', label: 'Beförderungen', icon: TrendingUp, href: '/promotions', permission: 'rank-changes:view', accent: 'mint', hint: 'Letzte Tage' },
  { key: 'recentTerminations', label: 'Kündigungen', icon: UserMinus, href: '/terminations', permission: 'terminations:view', accent: 'rose', hint: 'Letzte Tage' },
]

const quickActions: { label: string; description: string; href: string; icon: LucideIcon; permission: Permission }[] = [
  { label: 'Roster prüfen', description: 'Status, Ränge & Ausbildungen', href: '/officers', icon: Users, permission: 'officers:view' },
  { label: 'Beförderungen', description: 'Beförderungslisten verwalten', href: '/promotions', icon: TrendingUp, permission: 'rank-changes:view' },
  { label: 'Degradierungen', description: 'Degradierungslisten verwalten', href: '/demotions', icon: TrendingDown, permission: 'rank-changes:view' },
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

const activityAccent: Record<string, AccentKey> = {
  OFFICER_CREATED: 'mint',
  OFFICER_UPDATED: 'sky',
  OFFICER_DELETED: 'rose',
  OFFICER_PROMOTED: 'emerald',
  OFFICER_PROMOTION_REVERTED: 'amber',
  OFFICER_TERMINATED: 'rose',
  TRAININGS_UPDATED: 'gold',
  NOTE_ADDED: 'sky',
  INACTIVITY_NOTE_DISMISSED: 'amber',
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
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-gradient-to-br from-[#d4af37]/15 to-[#d4af37]/5 border border-[#d4af37]/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <Icon size={14} className="text-[#d4af37]" strokeWidth={1.85} />
          </span>
            <h3 className="text-[14px] font-semibold text-white tracking-[-0.01em]">{title}</h3>
          </div>
          {description && <p className="text-[12px] text-[#7d94b0] mt-2 max-w-2xl leading-relaxed pl-[38px]">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
  )
}

function ProgressRow({ label, value, detail, color = '#d4af37' }: { label: string; value: number; detail: string; color?: string }) {
  const width = Math.min(Math.max(value, 0), 100)
  return (
      <div>
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <span className="text-[12.5px] text-[#c2d2e3] truncate">{label}</span>
          <span className="text-[11.5px] text-[#9fb0c4] tabular-nums font-medium shrink-0">{detail}</span>
        </div>
        <div className="h-[6px] bg-[#06182e]/90 rounded-full overflow-hidden ring-1 ring-inset ring-white/[0.03]">
          <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${width}%` }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                boxShadow: `0 0 8px ${color}33`,
              }}
          />
        </div>
      </div>
  )
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-11 w-11 rounded-full bg-[#d4af37]/5 border border-[#d4af37]/10 flex items-center justify-center mb-3">
          <Icon size={18} className="text-[#d4af37]/40" strokeWidth={1.5} />
        </div>
        <p className="text-[12.5px] text-[#7d94b0]">{text}</p>
      </div>
  )
}

function notificationClass(severity: 'info' | 'warning' | 'error') {
  if (severity === 'error') return 'border-[#7f1d1d]/55 bg-[#2a1212]/55 text-[#fca5a5] hover:border-[#7f1d1d]/80'
  if (severity === 'warning') return 'border-[#b45309]/50 bg-[#1d1608]/55 text-[#fbbf24] hover:border-[#b45309]/75'
  return 'border-[#234568]/65 bg-[#0a1a33]/55 text-[#93c5fd] hover:border-[#234568]/90'
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

function RingProgress({ value, color = '#d4af37', size = 64, stroke = 5 }: { value: number; color?: string; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  const offset = circumference - (clamped / 100) * circumference
  return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="#0a2240" strokeWidth={stroke} fill="none" />
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
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              style={{ strokeDasharray: circumference, filter: `drop-shadow(0 0 4px ${color}66)` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-semibold text-white tabular-nums">{clamped}%</span>
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
        <div className="max-w-6xl mx-auto">
          <div className={cn(panelClass, 'text-center py-16 px-6 mt-6')}>
            <div className="mx-auto h-12 w-12 rounded-full bg-[#f87171]/10 border border-[#f87171]/25 flex items-center justify-center mb-4">
              <AlertTriangle size={22} className="text-[#f87171]" strokeWidth={1.75} />
            </div>
            <h2 className="text-[15px] font-semibold text-white mb-1">Dashboard nicht verfügbar</h2>
            <p className="text-[12.5px] text-[#9fb0c4] mb-5 max-w-md mx-auto">{error || 'Die Dashboard-Daten konnten gerade nicht geladen werden.'}</p>
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
      <div className="max-w-7xl mx-auto space-y-6 pb-4">
        {/* ===== HERO ===== */}
        <section className="relative overflow-hidden rounded-[20px] border border-[#1a3559]/55 bg-gradient-to-br from-[#0c2545] via-[#0a1f3a] to-[#06152a] shadow-[0_2px_4px_rgba(0,0,0,0.18),0_18px_48px_rgba(0,0,0,0.28)]">
          {/* decorative */}
          <div className="absolute inset-0 pointer-events-none opacity-70" aria-hidden>
            <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#d4af37]/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[#1e3a8a]/30 blur-3xl" />
            <div
                className="absolute inset-0"
                style={{
                  backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(212,175,55,0.06) 1px, transparent 0)',
                  backgroundSize: '28px 28px',
                  maskImage: 'radial-gradient(ellipse at top, black 30%, transparent 80%)',
                }}
            />
          </div>
          <div className="relative p-6 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/25 bg-[#d4af37]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f0d060]">
                  <Sparkles size={10} strokeWidth={2.25} />
                  Übersicht
                </span>
                  <span className="text-[10.5px] font-medium text-[#6b8299] uppercase tracking-[0.16em]">{dateLine}</span>
                  {timeLine && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[10.5px] font-mono text-[#6b8299] uppercase tracking-[0.1em]">
                    · {timeLine} Uhr
                  </span>
                  )}
                </div>
                <h1 className="text-[26px] sm:text-[30px] font-semibold text-white tracking-[-0.025em] leading-tight">
                  {greeting}{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.
                </h1>
                <p className="text-[13.5px] text-[#9fb0c4] mt-1.5 max-w-xl leading-relaxed">
                  Personalstand, Ausbildungen und Vorgänge des LSPD auf einen Blick. {stats.currentOfficers > 0 ? `${stats.activeOfficers} von ${stats.currentOfficers} Officers sind aktuell einsatzbereit.` : 'Aktuell sind keine Officers im System.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-[10px] border border-emerald-400/15 bg-emerald-400/[0.05]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-400/50 animate-ping" />
                  <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                  <span className="text-[12px] text-emerald-300 font-medium tabular-nums">
                  {stats.dutyTimes?.activeCount ?? 0} im Dienst
                </span>
                </div>
                <Button variant="outline" size="sm" onClick={refetch} className="shrink-0">
                  <RefreshCw size={13} strokeWidth={2} />
                  Aktualisieren
                </Button>
                <Button
                    size="sm"
                    onClick={openAbsenceModal}
                    disabled={!user?.discordId && !canManageAbsences}
                    title={!user?.discordId && !canManageAbsences ? 'Dein Dashboard-User braucht eine Discord-ID.' : undefined}
                >
                  <CalendarPlus size={13} strokeWidth={2} />
                  Abmelden
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ===== KPI CARDS ===== */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.filter((card) => hasPermission(user, card.permission)).map((card, i) => {
            const Icon = card.icon
            const accent = ACCENTS[card.accent]
            const label = card.key === 'recentPromotions' || card.key === 'recentTerminations'
                ? `${card.label}`
                : card.label
            const subLine = card.key === 'recentPromotions' || card.key === 'recentTerminations'
                ? `Letzte ${stats.recentWindowDays} Tage`
                : card.hint
            return (
                <motion.div
                    key={card.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.035 }}
                >
                  <Link
                      href={card.href}
                      className="group relative block rounded-[14px] border border-[#1a3559]/55 bg-[#091e36]/70 backdrop-blur-md p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[var(--accent-ring)] overflow-hidden"
                      style={{
                        // @ts-expect-error CSS custom prop
                        '--accent-ring': accent.ring,
                      }}
                  >
                    <div
                        className="absolute -top-12 -right-12 h-28 w-28 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: accent.glow }}
                        aria-hidden
                    />
                    <div className="relative flex items-start justify-between gap-2">
                  <span
                      className="flex h-9 w-9 items-center justify-center rounded-[10px] border"
                      style={{ background: accent.bg, borderColor: accent.ring, color: accent.text }}
                  >
                    <Icon size={16} strokeWidth={1.85} />
                  </span>
                      <ArrowUpRight size={13} className="text-[#4a6585] group-hover:text-[#d4af37] transition-colors" strokeWidth={1.85} />
                    </div>
                    <div className="relative mt-3">
                      <p className="text-[26px] font-semibold text-white tabular-nums leading-none tracking-tight">{stats[card.key]}</p>
                      <p className="text-[12px] text-[#c2d2e3] mt-2 font-medium leading-tight">{label}</p>
                      <p className="text-[10.5px] text-[#6b8299] mt-1 leading-tight">{subLine}</p>
                    </div>
                  </Link>
                </motion.div>
            )
          })}
        </div>

        {/* ===== NOTIFICATIONS ===== */}
        {stats.notifications.length > 0 && (
            <motion.section
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.06 }}
                className={cn(panelClass, 'p-5')}
            >
              <SectionHeader
                  icon={AlertTriangle}
                  title="Benachrichtigungen"
                  description="Hinweise aus Fristen, Ausbildung, Probezeiten und Kalender"
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {stats.notifications.map((item) => (
                    <Link
                        key={item.id}
                        href={item.href}
                        className={cn('group flex items-start gap-3 rounded-[11px] border px-4 py-3 transition-colors', notificationClass(item.severity))}
                    >
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-current shrink-0 opacity-80 group-hover:opacity-100" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold leading-tight">{item.title}</p>
                        <p className="mt-1 text-[12px] opacity-85 leading-relaxed">{item.description}</p>
                      </div>
                      <ArrowRight size={13} className="mt-0.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" strokeWidth={1.85} />
                    </Link>
                ))}
              </div>
            </motion.section>
        )}

        {/* ===== ABSENCES ===== */}
        <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
            className={cn(panelClass, 'p-5')}
        >
          <SectionHeader
              icon={CalendarX}
              title="Aktuelle Abmeldungen"
              description="Entschuldigte Officers verschwinden automatisch aus Dashboard und Discord-Panel, sobald die Abmeldung endet."
          />
          {stats.activeAbsences.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {stats.activeAbsences.map((absence) => {
                  const canCancel = canManageAbsences || (!!user?.discordId && absence.officer.discordId === user.discordId)
                  return (
                      <div key={absence.id} className={cn(surfaceClass, 'p-4 transition-colors hover:border-[#d4af37]/15')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link href={`/officers/${absence.officer.id}`} className="text-[13px] font-semibold text-white hover:text-[#d4af37] transition-colors">
                              {officerName(absence.officer)}
                              <span className="ml-1.5 font-mono text-[#d4af37]">#{displayBadgeNumber(absence.officer.badgeNumber)}</span>
                            </Link>
                            <p className="text-[11.5px] text-[#8ea4bd] mt-0.5">{absence.officer.rank.name}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-[#38bdf8]/25 bg-[#06233a]/60 px-2.5 py-1 text-[11px] text-[#93c5fd] font-medium">
                      bis {formatDate(absence.endsAt)}
                    </span>
                        </div>
                        <p className="mt-2.5 text-[12.5px] leading-relaxed text-[#c7d4e4]">{absence.reason}</p>
                        <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-white/[0.04]">
                    <span className="text-[10.5px] text-[#6b8299] tabular-nums">
                      {formatDateTime(absence.startsAt)} → {formatDateTime(absence.endsAt)}
                    </span>
                          {canCancel && (
                              <button
                                  type="button"
                                  onClick={() => cancelAbsence(absence.id)}
                                  className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[11.5px] text-[#fca5a5] transition-colors hover:bg-[#321218]/60"
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

        {/* ===== OPERATIONAL + QUICK ===== */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.12 }}
              className={cn(panelClass, 'p-5 xl:col-span-2')}
          >
            <SectionHeader
                icon={Activity}
                title="Operative Übersicht"
                description={`Aktuelle Lage für ${stats.currentOfficers} aktive Officers`}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              <div className={cn(surfaceClass, 'p-4 flex items-center gap-4')}>
                <RingProgress value={stats.readinessRate} color="#34d399" />
                <div className="min-w-0">
                  <p className="text-[11.5px] font-medium text-[#9fb0c4] uppercase tracking-[0.08em]">Dienstbereit</p>
                  <p className="text-[20px] font-semibold text-white tabular-nums leading-tight mt-0.5">{stats.activeOfficers}</p>
                  <p className="text-[11px] text-[#7d94b0] mt-0.5">{activeSummary}</p>
                </div>
              </div>
              <div className={cn(surfaceClass, 'p-4 flex items-center gap-4')}>
                <RingProgress value={stats.trainingCompletionRate} color="#d4af37" />
                <div className="min-w-0">
                  <p className="text-[11.5px] font-medium text-[#9fb0c4] uppercase tracking-[0.08em]">Ausbildung</p>
                  <p className="text-[20px] font-semibold text-white tabular-nums leading-tight mt-0.5">{stats.completedTrainingAssignments}</p>
                  <p className="text-[11px] text-[#7d94b0] mt-0.5">{trainingSummary}</p>
                </div>
              </div>
              <Link href="/promotions" className={cn(surfaceClass, 'p-4 flex items-center gap-4 transition-colors hover:border-[#d4af37]/20 group')}>
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#d4af37]/20 bg-[#d4af37]/5">
                  <ListChecks size={22} className="text-[#d4af37]" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-medium text-[#9fb0c4] uppercase tracking-[0.08em]">Offene Listen</p>
                  <p className="text-[20px] font-semibold text-white tabular-nums leading-tight mt-0.5">{stats.draftRankChangeLists}</p>
                  <p className="text-[11px] text-[#7d94b0] mt-0.5">Beförderungen & Degradierungen</p>
                </div>
                <ArrowRight size={14} className="text-[#4a6585] group-hover:text-[#d4af37] group-hover:translate-x-0.5 transition-all" strokeWidth={1.85} />
              </Link>
            </div>

            {stats.dutyTimes && (
                <Link
                    href="/duty-times"
                    className={cn(surfaceClass, 'mb-5 flex flex-col gap-3 p-4 transition-all duration-200 hover:border-[#d4af37]/20 sm:flex-row sm:items-center sm:justify-between')}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-[10px] flex items-center justify-center bg-gradient-to-br from-[#d4af37] to-[#c29d32] text-[#071b33] shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)]">
                      <Clock3 size={17} strokeWidth={1.85} />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-white">Dienstzeiten</p>
                      <p className="text-[11.5px] text-[#9fb0c4]">{stats.dutyTimes.activeCount} im Dienst · {formatDuration(stats.dutyTimes.totalWeekDurationMs)} diese Woche</p>
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
                const color = status.status === 'ACTIVE' ? '#34d399' : status.status === 'AWAY' ? '#38bdf8' : status.status === 'INACTIVE' ? '#fbbf24' : '#f87171'
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
          </motion.section>

          <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.16 }}
              className={cn(panelClass, 'p-5')}
          >
            <SectionHeader icon={ArrowUpRight} title="Schnellzugriffe" description="Direkt zu den häufigsten HR-Aufgaben" />
            <div className="space-y-2">
              {quickActions.filter((action) => hasPermission(user, action.permission)).map((action) => {
                const Icon = action.icon
                return (
                    <Link
                        key={action.href}
                        href={action.href}
                        className={cn('group flex items-center gap-3 px-3.5 py-3 transition-all duration-200 hover:border-[#d4af37]/20', surfaceClass)}
                    >
                      <div className="h-9 w-9 rounded-[9px] flex items-center justify-center bg-gradient-to-br from-[#d4af37]/15 to-[#d4af37]/5 border border-[#d4af37]/20 text-[#d4af37]">
                        <Icon size={15} strokeWidth={1.85} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-white">{action.label}</p>
                        <p className="text-[11.5px] text-[#8ea4bd] truncate">{action.description}</p>
                      </div>
                      <ArrowRight size={13} className="text-[#4a6585] group-hover:text-[#d4af37] group-hover:translate-x-0.5 transition-all" strokeWidth={1.85} />
                    </Link>
                )
              })}
            </div>
          </motion.section>
        </div>

        {/* ===== TRAININGS + HR FOCUS ===== */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className={cn(panelClass, 'p-5 xl:col-span-3')}
          >
            <SectionHeader icon={ClipboardCheck} title="Ausbildungsstand" description="Abdeckung pro Ausbildung über alle aktiven Officers" />
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
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.24 }}
              className={cn(panelClass, 'p-5 xl:col-span-2')}
          >
            <SectionHeader icon={AlertTriangle} title="HR-Fokus" description="Abgemeldete und inaktive Officers" />
            {stats.attentionOfficers.length > 0 ? (
                <div className="space-y-2">
                  {stats.attentionOfficers.map((officer) => (
                      <Link
                          key={officer.id}
                          href={`/officers/${officer.id}`}
                          className={cn('flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:border-[#d4af37]/15', surfaceClass)}
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate">
                            {officerName(officer)}
                            <span className="text-[#d4af37] font-mono ml-1.5 font-medium">#{displayBadgeNumber(officer.badgeNumber)}</span>
                          </p>
                          <p className="text-[11.5px] text-[#8ea4bd] truncate mt-0.5">
                            {officer.rank.name} · {officer.lastOnline ? `zuletzt online ${formatRelativeTime(officer.lastOnline)}` : `aktualisiert ${formatDate(officer.updatedAt)}`}
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

        {/* ===== ACTIVITY + NOTES + HIRES ===== */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.28 }}
              className={cn(panelClass, 'p-5 xl:col-span-3')}
          >
            <SectionHeader
                icon={ScrollText}
                title="Aktuelle Aktivitäten"
                description="Letzte Änderungen im Systemprotokoll"
                action={
                  hasPermission(user, 'logs:view') ? (
                      <Link href="/logs" className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#d4af37] hover:text-[#f0d060] transition-colors">
                        Alle ansehen
                        <ArrowRight size={11} strokeWidth={2} />
                      </Link>
                  ) : null
                }
            />
            {stats.recentActivity.length > 0 ? (
                <div className="relative">
                  {/* timeline rail */}
                  <div className="absolute left-[18px] top-2 bottom-2 w-px bg-gradient-to-b from-[#d4af37]/25 via-[#d4af37]/8 to-transparent" aria-hidden />
                  <div className="space-y-3.5">
                    {stats.recentActivity.map((entry) => {
                      const label = actionLabels[entry.action] || entry.action
                      const accent = ACCENTS[activityAccent[entry.action] ?? 'gold']
                      return (
                          <div key={entry.id} className="relative flex items-start gap-3.5 pl-0">
                            <div
                                className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-[#06152a]"
                                style={{ borderColor: accent.ring, color: accent.text, boxShadow: `0 0 0 3px rgba(6,21,42,0.9)` }}
                            >
                              <Activity size={13} strokeWidth={1.85} />
                            </div>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="text-[12.5px] font-semibold text-white">{label}</span>
                                {entry.officer && (
                                    <Link href={`/officers/${entry.officer.id}`} className="text-[12px] text-[#d4af37] hover:text-white transition-colors">
                                      {officerName(entry.officer)} <span className="font-mono">#{displayBadgeNumber(entry.officer.badgeNumber)}</span>
                                    </Link>
                                )}
                              </div>
                              {entry.details && <p className="text-[12px] text-[#b7c5d8] mt-0.5">{entry.details}</p>}
                              {entry.oldValue && entry.newValue && (
                                  <p className="text-[11.5px] text-[#7089a5] mt-0.5">
                                    <span className="line-through opacity-70">{entry.oldValue}</span>
                                    <span className="mx-1.5 text-[#4a6585]">→</span>
                                    <span className="text-[#c2d2e3]">{entry.newValue}</span>
                                  </p>
                              )}
                              <p className="text-[10.5px] text-[#6b8299] mt-1 tabular-nums">
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
          </motion.section>

          <div className="xl:col-span-2 space-y-4">
            <motion.section
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.32 }}
                className={cn(panelClass, 'p-5')}
            >
              <SectionHeader icon={Pin} title="Angepinnte Notizen" description="Wichtige Hinweise für HR & Führung" />
              {stats.pinnedNotes.length > 0 ? (
                  <div className="space-y-2">
                    {stats.pinnedNotes.map((note) => (
                        <Link
                            key={note.id}
                            href={note.officer ? `/officers/${note.officer.id}` : '/notes'}
                            className={cn('block px-3.5 py-3 transition-colors hover:border-[#d4af37]/15', surfaceClass)}
                        >
                          <p className="text-[13px] font-semibold text-white">{note.title || 'Notiz'}</p>
                          <p className="text-[12px] text-[#b7c5d8] mt-1 leading-relaxed">{truncateText(note.content, 120)}</p>
                          <p className="text-[10.5px] text-[#d4af37] mt-2 font-medium">
                            {note.officer ? `${officerName(note.officer)} · ` : ''}{note.author?.displayName ?? 'Gelöscht'}
                          </p>
                        </Link>
                    ))}
                  </div>
              ) : (
                  <EmptyState icon={FileText} text="Keine angepinnten Notizen" />
              )}
            </motion.section>

            <motion.section
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.36 }}
                className={cn(panelClass, 'p-5')}
            >
              <SectionHeader icon={CalendarDays} title="Neue Officers" description="Zuletzt eingestellte Mitarbeiter" />
              {stats.recentHires.length > 0 ? (
                  <div className="space-y-2">
                    {stats.recentHires.map((officer) => (
                        <Link
                            key={officer.id}
                            href={`/officers/${officer.id}`}
                            className={cn('flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:border-[#d4af37]/15', surfaceClass)}
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-white truncate">
                              {officerName(officer)}
                            </p>
                            <p className="text-[11.5px] text-[#8ea4bd] truncate mt-0.5">{officer.rank.name}</p>
                          </div>
                          <span className="text-[11px] text-[#d4af37] shrink-0 font-medium tabular-nums">{formatDate(officer.hireDate)}</span>
                        </Link>
                    ))}
                  </div>
              ) : (
                  <EmptyState icon={Users} text="Keine Officers vorhanden" />
              )}
            </motion.section>
          </div>
        </div>

        {/* ===== RANK DISTRIBUTION ===== */}
        {visibleRankDistribution.length > 0 && (
            <motion.section
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 }}
                className={cn(panelClass, 'p-5')}
            >
              <SectionHeader icon={Users} title="Rangverteilung" description="Aktive Officers nach Rang" />
              <div className="space-y-2.5">
                {visibleRankDistribution.map((rank) => {
                  const percentage = (rank.count / topRankCount) * 100
                  return (
                      <div key={rank.rank} className="flex items-center gap-3">
                        <div className="w-36 sm:w-44 text-[12.5px] text-[#c2d2e3] truncate font-medium">{rank.rank}</div>
                        <div className="flex-1 h-[24px] bg-[#06182e]/80 rounded-[7px] overflow-hidden ring-1 ring-inset ring-white/[0.03]">
                          <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 0.7, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
                              className="h-full rounded-[7px] flex items-center justify-end pr-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                              style={{ minWidth: rank.count > 0 ? '1.75rem' : 0, backgroundColor: rank.color }}
                          >
                            <span className="text-[10.5px] font-semibold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)] tabular-nums">{rank.count}</span>
                          </motion.div>
                        </div>
                      </div>
                  )
                })}
              </div>
            </motion.section>
        )}

        {/* ===== ABSENCE MODAL ===== */}
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
                <p className="rounded-[10px] border border-[#3d2d12] bg-[#1d1608] px-3.5 py-2.5 text-[12px] text-[#e8c979] leading-relaxed">
                  Dein Dashboard-User braucht eine Discord-ID, damit die Abmeldung deinem Officer zugeordnet werden kann.
                </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setAbsenceModalOpen(false)}>Abbrechen</Button>
              <Button size="sm" onClick={submitAbsence} loading={absenceSubmitting} disabled={!canSubmitAbsence}>
                <Send size={13} strokeWidth={2} />
                Eintragen
              </Button>
            </div>
          </div>
        </Modal>
      </div>
  )
}