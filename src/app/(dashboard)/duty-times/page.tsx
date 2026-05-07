'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Activity, AlertTriangle, BarChart3, Clock3, Database, RefreshCw, Signal, Timer, Users, Wifi } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Button } from '@/components/ui/button'
import { useFetch } from '@/hooks/use-fetch'
import { useAuth } from '@/context/auth-context'
import { cn, formatDateTime } from '@/lib/utils'
import { hasPermission } from '@/lib/permissions'
import { displayBadgeNumber } from '@/lib/badge-number'

type ApiStatus = 'online' | 'offline' | 'ignored-job' | 'not-linked' | 'not-configured' | 'error'

interface CurrentPlayer {
  source: 'api' | 'session'
  name: string
  identifier: string | null
  steamId: string | null
  job: string | null
  ping: number | null
  playtimeSeconds: number | null
  connectedAt: string | null
}

interface DailyPoint {
  date: string
  label: string
  durationMs: number
  durationLabel: string
}

interface DutyOfficer {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  discordId: string | null
  status: string
  rank: { name: string; color: string; sortOrder: number }
  activeSession: { id: string; clockInAt: string; currentDurationMs: number } | null
  activePlaySession: {
    id: string
    startedAt: string
    currentDurationMs: number
    playerName: string
    license: string | null
    lastSeenAt: string
  } | null
  currentPlayer: CurrentPlayer | null
  online: boolean
  scriptConnected: boolean
  lastHeartbeat: string | null
  apiStatus: ApiStatus
  apiError?: string
  weekDurationMs: number
  playtimeWeekDurationMs: number
  sessionCount: number
  averageSessionMs: number
  longestSessionMs: number
  lastSeenAt: string | null
  daily: DailyPoint[]
}

interface DutySnapshot {
  now: string
  weekStart: string
  sync: {
    configured: boolean
    checkedAt: string
    onlineCount: number
    errorCount: number
  }
  activeCount: number
  totalActiveDurationMs: number
  totalWeekDurationMs: number
  totalPlaytimeWeekDurationMs: number
  totalSessionCount: number
  averageSessionMs: number
  longestSessionMs: number
  rows: DutyOfficer[]
  activeRows: DutyOfficer[]
  topRows: DutyOfficer[]
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

function officerName(officer: DutyOfficer) {
  return `${officer.firstName} ${officer.lastName}`
}

function statusLabel(status: ApiStatus) {
  const labels: Record<ApiStatus, string> = {
    online: 'im Dienst',
    offline: 'offline',
    'ignored-job': 'nicht police',
    'not-linked': 'keine Discord-ID',
    'not-configured': 'nicht konfiguriert',
    error: 'API-Fehler',
  }
  return labels[status]
}

export default function DutyTimesPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'duty-times:view')
  const { data, loading, error, refetch } = useFetch<DutySnapshot>(canView ? '/api/duty-times' : null)

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Dienstzeiten" description="Live-Übersicht der aktiven Police-Spielzeit" />
        <div className="glass-panel-elevated rounded-[14px] p-8 text-center">
          <AlertTriangle size={26} className="mx-auto text-[#f87171] mb-3" />
          <p className="text-[13px] text-[#9fb0c4] mb-4">{error || 'Dienstzeiten konnten nicht geladen werden'}</p>
          <Button size="sm" onClick={refetch}><RefreshCw size={13} /> Erneut laden</Button>
        </div>
      </div>
    )
  }

  const topMax = Math.max(...data.topRows.map((row) => row.weekDurationMs), 1)

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader
        title="Dienstzeiten"
        description="Automatische Police-Spielzeit über die Player-Online-API"
        action={<Button variant="secondary" size="sm" onClick={refetch}><RefreshCw size={13} /> Aktualisieren</Button>}
      />

      {!data.sync.configured && (
        <div className="rounded-[12px] border border-[#3d2d12] bg-[#1d1608]/80 px-4 py-3 text-[12.5px] text-[#e8c979]">
          Player-Online API ist nicht konfiguriert. Historische Spielzeit bleibt sichtbar, Live-Status wird erst mit Server-Env `PLAYER_ONLINE_API_SECRET` synchronisiert.
        </div>
      )}

      {data.sync.errorCount > 0 && (
        <div className="rounded-[12px] border border-[#3b1616] bg-[#1c1111]/80 px-4 py-3 text-[12.5px] text-[#fca5a5]">
          {data.sync.errorCount} Player-Online-Abfragen sind fehlgeschlagen. Die betroffenen Officers sind unten markiert.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3.5">
        <SummaryCard icon={Users} label="Im Dienst" value={String(data.activeCount)} />
        <SummaryCard icon={Timer} label="Aktiv jetzt" value={formatDuration(data.totalActiveDurationMs)} />
        <SummaryCard icon={Clock3} label="Spielzeit Woche" value={formatDuration(data.totalWeekDurationMs)} />
        <SummaryCard icon={Activity} label="Sessions" value={String(data.totalSessionCount)} />
        <SummaryCard icon={BarChart3} label="Ø Session" value={formatDuration(data.averageSessionMs)} />
        <SummaryCard icon={Database} label="Längste Session" value={formatDuration(data.longestSessionMs)} />
      </div>

      <section className="glass-panel-elevated rounded-[14px] p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[13.5px] font-semibold text-[#f7fbff]">Top-Spielzeit diese Woche</h3>
            <p className="text-[12px] text-[#7089a5] mt-1">Woche seit {formatDateTime(data.weekStart)} · Sync {formatDateTime(data.sync.checkedAt)}</p>
          </div>
        </div>
        {data.topRows.length > 0 ? (
          <div className="space-y-2.5">
            {data.topRows.map((officer) => (
              <Link key={officer.id} href={`/officers/${officer.id}`} className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 rounded-[9px] border border-[#1e3a5c]/45 bg-[#0a1e38]/60 px-3 py-2.5 transition-colors hover:border-[#d4af37]/20">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[12.5px] font-medium text-white">
                      {officerName(officer)} <span className="font-mono text-[#d4af37]">#{displayBadgeNumber(officer.badgeNumber)}</span>
                    </p>
                    <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#d4af37]">{formatDuration(officer.weekDurationMs)}</span>
                  </div>
                  <div className="mt-2 h-[7px] overflow-hidden rounded-full bg-[#061426]/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#d4af37] to-[#38bdf8]"
                      style={{ width: `${Math.max(4, (officer.weekDurationMs / topMax) * 100)}%` }}
                    />
                  </div>
                </div>
                <StatusPill status={officer.apiStatus} />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={BarChart3} text="Noch keine Spielzeit in dieser Woche" />
        )}
      </section>

      <section className="glass-panel-elevated rounded-[14px] p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[13.5px] font-semibold text-[#f7fbff]">Aktuell im Dienst</h3>
            <p className="text-[12px] text-[#7089a5] mt-1">Online, Script verbunden und Job `police`</p>
          </div>
        </div>

        {data.activeRows.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {data.activeRows.map((officer, index) => (
              <motion.div
                key={officer.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
                className="rounded-[10px] border border-[#1e3a5c]/50 bg-[#0a1e38]/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/officers/${officer.id}`} className="text-[14px] font-semibold text-white transition-colors hover:text-[#d4af37]">
                      {officerName(officer)}
                      <span className="ml-1 font-mono text-[#d4af37]">#{displayBadgeNumber(officer.badgeNumber)}</span>
                    </Link>
                    <p className="text-[12px] text-[#9fb0c4] mt-1">{officer.rank.name}</p>
                  </div>
                  <StatusPill status={officer.apiStatus} />
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <Metric label="Spieler" value={officer.currentPlayer?.name ?? officer.activePlaySession?.playerName} />
                  <Metric label="Seit" value={formatDateTime(officer.activePlaySession?.startedAt)} />
                  <Metric label="Aktiv" value={formatDuration(officer.activePlaySession?.currentDurationMs ?? 0)} strong />
                  <Metric label="Ping" value={officer.currentPlayer?.ping !== null && officer.currentPlayer?.ping !== undefined ? `${officer.currentPlayer.ping}ms` : '—'} />
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <IdentityMetric label="Identifier" value={officer.currentPlayer?.identifier ?? officer.activePlaySession?.license} />
                  <IdentityMetric label="Steam-ID" value={officer.currentPlayer?.steamId} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11.5px] text-[#7089a5]">
                  <span>Woche: <strong className="text-[#d4af37]">{formatDuration(officer.weekDurationMs)}</strong></span>
                  <span>Sessions: <strong className="text-[#c7d4e4]">{officer.sessionCount}</strong></span>
                  <span>Heartbeat: <strong className="text-[#c7d4e4]">{formatDateTime(officer.lastHeartbeat)}</strong></span>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Wifi} text="Aktuell ist kein Police-Spieler im Dienst" />
        )}
      </section>

      <section className="glass-panel-elevated rounded-[14px] p-5">
        <h3 className="text-[13.5px] font-semibold text-[#f7fbff] mb-1">Wochenübersicht pro Spieler</h3>
        <p className="text-[12px] text-[#7089a5] mb-4">
          Alle nicht gekündigten Officers mit Live-Status, IDs und Spielzeitstatistik.
        </p>
        <div className="divide-y divide-[#d4af37]/10">
          {data.rows.map((officer) => (
            <div key={officer.id} className="grid grid-cols-1 gap-3 py-3 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_260px_330px] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/officers/${officer.id}`} className="text-[13px] font-medium text-white transition-colors hover:text-[#d4af37]">
                    {officerName(officer)} <span className="font-mono text-[#d4af37]">#{displayBadgeNumber(officer.badgeNumber)}</span>
                  </Link>
                  <StatusPill status={officer.apiStatus} compact />
                </div>
                <p className="mt-0.5 text-[11.5px] text-[#7089a5]">{officer.rank.name}</p>
                {officer.currentPlayer && (
                  <p className="mt-1 truncate text-[11px] text-[#5c728a]">
                    {officer.currentPlayer.name}
                    {officer.currentPlayer.identifier ? ` · ${officer.currentPlayer.identifier}` : ''}
                    {officer.currentPlayer.steamId ? ` · ${officer.currentPlayer.steamId}` : ''}
                  </p>
                )}
                {officer.apiError && <p className="mt-1 truncate text-[11px] text-[#fca5a5]">{officer.apiError}</p>}
              </div>

              <MiniBars daily={officer.daily} />

              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-2">
                <Metric label="Woche" value={formatDuration(officer.weekDurationMs)} strong />
                <Metric label="Jetzt" value={officer.activePlaySession ? formatDuration(officer.activePlaySession.currentDurationMs) : 'offline'} />
                <Metric label="Ø" value={formatDuration(officer.averageSessionMs)} />
                <Metric label="Längste" value={formatDuration(officer.longestSessionMs)} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="glass-panel-elevated rounded-[14px] border border-white/[0.04] p-4">
      <div className="flex items-center gap-3">
        <div className="icon-tile h-10 w-10 rounded-[10px] flex items-center justify-center">
          <Icon size={18} strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[21px] font-semibold text-white tabular-nums leading-tight">{value}</p>
          <p className="text-[11.5px] text-[#8ea4bd] mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, strong }: { label: string; value?: string; strong?: boolean }) {
  return (
    <div className="rounded-[8px] bg-[#061426]/50 px-3 py-2">
      <p className="text-[10.5px] font-medium uppercase text-[#4a6585]">{label}</p>
      <p className={cn('mt-1 truncate text-[12.5px] tabular-nums', strong ? 'font-semibold text-[#d4af37]' : 'text-[#c7d4e4]')}>{value || '—'}</p>
    </div>
  )
}

function IdentityMetric({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-[8px] bg-[#061426]/50 px-3 py-2">
      <p className="text-[10.5px] font-medium uppercase text-[#4a6585]">{label}</p>
      <p className="mt-1 truncate font-mono text-[11.5px] text-[#c7d4e4]" title={value || undefined}>{value || '—'}</p>
    </div>
  )
}

function StatusPill({ status, compact }: { status: ApiStatus; compact?: boolean }) {
  const online = status === 'online'
  const error = status === 'error'
  return (
    <span className={cn(
      'inline-flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px]',
      compact && 'px-2 py-0.5 text-[10.5px]',
      online
        ? 'border-[#22c55e]/25 bg-[#052e1b]/60 text-[#86efac]'
        : error
          ? 'border-[#ef4444]/25 bg-[#2a1111]/60 text-[#fca5a5]'
          : 'border-[#234568]/60 bg-[#0a1a33]/60 text-[#8ea4bd]',
    )}>
      {online ? <Signal size={compact ? 10 : 12} /> : <span className={cn('h-1.5 w-1.5 rounded-full', error ? 'bg-[#ef4444]' : 'bg-[#4a6585]')} />}
      {statusLabel(status)}
    </span>
  )
}

function MiniBars({ daily }: { daily: DailyPoint[] }) {
  const max = Math.max(...daily.map((day) => day.durationMs), 1)
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {daily.map((day) => (
        <div key={`${day.date}-${day.label}`} className="min-w-0">
          <div className="flex h-[34px] items-end rounded-[6px] bg-[#061426]/60 px-1">
            <div
              className="w-full rounded-t-[4px] bg-gradient-to-t from-[#1d4ed8] to-[#38bdf8]"
              style={{ height: Math.max(4, Math.round((day.durationMs / max) * 28)) }}
              title={`${day.label}: ${day.durationLabel}`}
            />
          </div>
          <p className="mt-1 truncate text-center text-[9.5px] text-[#7089a5]">{day.label}</p>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="rounded-[10px] border border-[#1e3a5c]/40 bg-[#0a1e38]/50 px-4 py-10 text-center">
      <Icon size={24} className="mx-auto text-[#d4af37]/35 mb-2" />
      <p className="text-[13px] text-[#8ea4bd]">{text}</p>
    </div>
  )
}
