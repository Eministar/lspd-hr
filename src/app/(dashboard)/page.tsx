'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useFetch } from '@/hooks/use-fetch'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Button } from '@/components/ui/button'
import { cn, formatDate, formatDateTime, getStatusDot, getStatusLabel } from '@/lib/utils'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ClipboardCheck,
  Clock,
  FileText,
  GraduationCap,
  ListChecks,
  Pin,
  RefreshCw,
  ScrollText,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '@/context/auth-context'
import { hasPermission, type Permission } from '@/lib/permissions'

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

export default function DashboardPage() {
  const { user } = useAuth()
  const canViewDashboard = hasPermission(user, 'dashboard:view')
  const { data: stats, loading, error, refetch } = useFetch<Stats>(canViewDashboard ? '/api/stats' : null)
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
          <Button variant="secondary" size="sm" onClick={refetch} className="shrink-0 w-fit">
            <RefreshCw size={13} strokeWidth={2} />
            Aktualisieren
          </Button>
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
                      <span className="text-[#d4af37] font-mono ml-1">#{officer.badgeNumber}</span>
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
                            {officerName(entry.officer)} #{entry.officer.badgeNumber}
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
    </div>
  )
}
