'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Activity, AlertTriangle, BarChart3, Clock3, Crown, Database, RefreshCw, Signal, Timer, Trophy, Users, Wifi } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Button } from '@/components/ui/button'
import { useFetch } from '@/hooks/use-fetch'
import { useAuth } from '@/context/auth-context'
import { cn, formatDateTime, formatRelativeTime } from '@/lib/utils'
import { hasPermission } from '@/lib/permissions'
import { displayBadgeNumber } from '@/lib/badge-number'
import { OfficerAvatar } from '@/components/officers/officer-avatar'

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
  avatarUrl: string | null
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
  totalDurationMs: number
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
    statusCounts: Record<ApiStatus, number>
    errorSummary: Array<{ message: string; count: number }>
  }
  activeCount: number
  totalActiveDurationMs: number
  totalWeekDurationMs: number
  totalPlaytimeWeekDurationMs: number
  totalAllTimeDurationMs: number
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
          <div className="glass-panel-elevated rounded-[12px] p-8 text-center">
            <AlertTriangle size={26} className="mx-auto text-red mb-3" />
            <p className="text-[13px] text-label-2 mb-4">{error || 'Dienstzeiten konnten nicht geladen werden'}</p>
            <Button size="sm" onClick={refetch}><RefreshCw size={13} /> Erneut laden</Button>
          </div>
        </div>
    )
  }

  const topMax = Math.max(...data.topRows.map((row) => row.weekDurationMs), 1)
  const podium = data.topRows.slice(0, 3)

  return (
      <div className="max-w-6xl mx-auto space-y-5">
        <PageHeader
            title="Dienstzeiten"
            description="Automatische Police-Spielzeit über die Player-Online-API"
            action={
              <div className="flex items-center gap-2">
            <span className="health-pill ok">
              <span className="live-pulse" /> {data.activeCount} live
            </span>
                <Button variant="secondary" size="sm" onClick={refetch}><RefreshCw size={13} /> Aktualisieren</Button>
              </div>
            }
        />

        {/* Live status bar */}
        <div className="glass-panel-elevated rounded-[12px] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="icon-tile h-11 w-11 rounded-[12px] flex items-center justify-center">
              <Wifi size={20} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-label truncate">
                {data.activeCount > 0 ? `${data.activeCount} ${data.activeCount === 1 ? 'Officer' : 'Officers'} aktuell im Dienst` : 'Aktuell niemand im Dienst'}
              </p>
              <p className="text-[11.5px] text-label-3 mt-0.5">
                Sync {formatRelativeTime(data.sync.checkedAt)} · Woche seit {formatDateTime(data.weekStart)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <span className={cn('health-pill', data.sync.errorCount > 0 ? 'err' : data.sync.configured ? 'ok' : 'warn')}>
            <Signal size={12} /> API {data.sync.errorCount > 0 ? 'fehlerhaft' : data.sync.configured ? 'abgefragt' : 'nicht konfiguriert'}
          </span>
            {data.sync.errorCount > 0 && <span className="health-pill err">{data.sync.errorCount} Fehler</span>}
          </div>
        </div>

        {!data.sync.configured && (
            <div className="rounded-[12px] border border-gold/25 bg-gold/10 px-4 py-3 text-[12.5px] text-gold-bright">
              Player-Online API ist nicht konfiguriert. Historische Spielzeit bleibt sichtbar, Live-Status wird erst mit Server-Env <code>PLAYER_ONLINE_API_SECRET</code> synchronisiert.
            </div>
        )}

        {data.sync.errorCount > 0 && (
            <div className="rounded-[12px] border border-red/30 bg-red/11 px-4 py-3 text-[12.5px] text-red">
              <p>{data.sync.errorCount} Player-Online-Abfragen sind fehlgeschlagen.</p>
              {data.sync.errorSummary.length > 0 && (
                  <ul className="mt-2 space-y-1 font-mono text-[11px] text-red">
                    {data.sync.errorSummary.map((entry) => (
                        <li key={entry.message}>{entry.count}× {entry.message}</li>
                    ))}
                  </ul>
              )}
            </div>
        )}

        {data.sync.configured && data.sync.onlineCount === 0 && data.sync.errorCount === 0 && (
            <div className="rounded-[12px] border border-line bg-surface px-4 py-3 text-[12px] text-label-2">
              Die API antwortet, meldet aber keinen aktiven Police-Spieler: {data.sync.statusCounts.offline} offline, {data.sync.statusCounts['ignored-job']} mit anderem Job und {data.sync.statusCounts['not-linked']} ohne Discord-Verknüpfung.
            </div>
        )}

        {/* KPI grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3.5">
          <KpiCard icon={Users} label="Im Dienst" value={String(data.activeCount)} accent="#32d74b" />
          <KpiCard icon={Timer} label="Aktiv jetzt" value={formatDuration(data.totalActiveDurationMs)} />
          <KpiCard icon={Clock3} label="Spielzeit Woche" value={formatDuration(data.totalWeekDurationMs)} accent="#d4af37" />
          <KpiCard icon={Trophy} label="Gesamt-Dienstzeit" value={formatDuration(data.totalAllTimeDurationMs)} accent="#64d2ff" />
          <KpiCard icon={Activity} label="Sessions" value={String(data.totalSessionCount)} />
          <KpiCard icon={BarChart3} label="Ø Session" value={formatDuration(data.averageSessionMs)} />
          <KpiCard icon={Database} label="Längste Session" value={formatDuration(data.longestSessionMs)} />
        </div>

        {/* Podium */}
        {podium.length > 0 && (
            <section className="glass-panel-elevated rounded-[12px] p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Trophy size={16} className="text-gold" />
                  <h3 className="text-[13.5px] font-semibold text-blue">Top-Spielzeit diese Woche</h3>
                </div>
                <span className="text-[11.5px] text-label-3">Sync {formatRelativeTime(data.sync.checkedAt)}</span>
              </div>

              {podium.length >= 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    {[podium[1], podium[0], podium[2]].filter(Boolean).map((officer) => {
                      // visual order: 2nd, 1st, 3rd
                      const rank = officer === podium[0] ? 1 : officer === podium[1] ? 2 : 3
                      const colors = rank === 1
                          ? { ring: 'ring-gold/40', text: 'text-gold', label: 'bg-gold text-ink', icon: <Crown size={14} /> }
                          : rank === 2
                              ? { ring: 'ring-label-4/30', text: 'text-label-2', label: 'bg-surface-4 text-label', icon: null }
                              : { ring: 'ring-orange/18', text: 'text-orange', label: 'bg-orange text-ink', icon: null }
                      return (
                          <Link
                              key={officer.id}
                              href={`/officers/${officer.id}`}
                              className={cn(
                                  'rounded-[12px] border border-line bg-surface p-4 ring-1 transition-colors hover:bg-surface-2',
                                  colors.ring,
                                  rank === 1 && 'md:order-2 md:scale-[1.03]',
                                  rank === 2 && 'md:order-1',
                                  rank === 3 && 'md:order-3',
                              )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 min-w-0">
                                <OfficerAvatar officer={officer} />
                                <div className="min-w-0">
                                  <p className="truncate text-[13px] font-semibold text-label">{officerName(officer)}</p>
                                  <p className="text-[11px] text-label-3 font-mono">#{displayBadgeNumber(officer.badgeNumber)} · {officer.rank.name}</p>
                                </div>
                              </div>
                              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', colors.label)}>
                        {colors.icon} {rank}
                      </span>
                            </div>
                            <p className={cn('mt-3 text-[20px] font-semibold tabular-nums', colors.text)}>{formatDuration(officer.weekDurationMs)}</p>
                            <p className="text-[11px] text-label-3">{officer.sessionCount} Sessions</p>
                          </Link>
                      )
                    })}
                  </div>
              )}

              {data.topRows.length > 3 && (
                  <div className="space-y-2">
                    {data.topRows.slice(3).map((officer) => (
                        <Link key={officer.id} href={`/officers/${officer.id}`} className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 rounded-[10px] border border-line bg-surface px-3 py-2.5 transition-colors hover:border-gold/25">
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-[12.5px] font-medium text-label">
                                {officerName(officer)} <span className="font-mono text-label-3">#{displayBadgeNumber(officer.badgeNumber)}</span>
                              </p>
                              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-gold">{formatDuration(officer.weekDurationMs)}</span>
                            </div>
                            <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-canvas">
                              <div
                                  className="h-full rounded-full bg-gold"
                                  style={{ width: `${Math.max(4, (officer.weekDurationMs / topMax) * 100)}%` }}
                              />
                            </div>
                          </div>
                          <StatusPill status={officer.apiStatus} />
                        </Link>
                    ))}
                  </div>
              )}
            </section>
        )}

        <section className="glass-panel-elevated rounded-[12px] p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="live-pulse" />
              <h3 className="text-[13.5px] font-semibold text-blue">Aktuell im Dienst</h3>
            </div>
            <span className="text-[11.5px] text-label-3">Online · Script verbunden · Job police</span>
          </div>

          {data.activeRows.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {data.activeRows.map((officer, index) => (
                    <motion.div
                        key={officer.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.03 }}
                        className="rounded-[12px] border border-green/9 bg-gradient-to-br from-surface/85 to-green/6 p-4 hover:border-green/18 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <OfficerAvatar officer={officer} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <Link href={`/officers/${officer.id}`} className="text-[14px] font-semibold text-label transition-colors hover:text-gold-bright">
                              {officerName(officer)}
                              <span className="ml-1 font-mono text-label-3">#{displayBadgeNumber(officer.badgeNumber)}</span>
                            </Link>
                            <StatusPill status={officer.apiStatus} />
                          </div>
                          <p className="text-[11.5px] text-label-2 mt-0.5">{officer.rank.name}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Metric label="Spieler" value={officer.currentPlayer?.name ?? officer.activePlaySession?.playerName} />
                        <Metric label="Seit" value={officer.activePlaySession ? formatRelativeTime(officer.activePlaySession.startedAt) : '—'} />
                        <Metric label="Aktiv" value={formatDuration(officer.activePlaySession?.currentDurationMs ?? 0)} strong />
                        <Metric label="Ping" value={officer.currentPlayer?.ping !== null && officer.currentPlayer?.ping !== undefined ? `${officer.currentPlayer.ping}ms` : '—'} />
                      </div>

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <IdentityMetric label="Identifier" value={officer.currentPlayer?.identifier ?? officer.activePlaySession?.license} />
                        <IdentityMetric label="Steam-ID" value={officer.currentPlayer?.steamId} />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-label-3">
                        <span>Woche: <strong className="text-gold tabular-nums">{formatDuration(officer.weekDurationMs)}</strong></span>
                        <span>Gesamt: <strong className="text-cyan tabular-nums">{formatDuration(officer.totalDurationMs)}</strong></span>
                        <span>Sessions: <strong className="text-label-2 tabular-nums">{officer.sessionCount}</strong></span>
                        <span>Heartbeat: <strong className="text-label-2">{formatRelativeTime(officer.lastHeartbeat ?? '')}</strong></span>
                      </div>
                    </motion.div>
                ))}
              </div>
          ) : (
              <EmptyState icon={Wifi} text="Aktuell ist kein Police-Spieler im Dienst" />
          )}
        </section>

        <section className="glass-panel-elevated rounded-[12px] p-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="text-[13.5px] font-semibold text-blue">Wochenübersicht pro Spieler</h3>
            <span className="text-[11.5px] text-label-3">{data.rows.length} Officers</span>
          </div>
          <p className="text-[12px] text-label-3 mb-4">
            Alle nicht gekündigten Officers mit Live-Status, IDs und Spielzeitstatistik.
          </p>
          <div className="divide-y divide-line">
            {data.rows.map((officer) => (
                <div key={officer.id} className="grid grid-cols-1 gap-3 py-3 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_260px_420px] xl:items-center">
                  <div className="min-w-0 flex items-start gap-3">
                    <OfficerAvatar officer={officer} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/officers/${officer.id}`} className="text-[13px] font-medium text-label transition-colors hover:text-gold-bright">
                          {officerName(officer)} <span className="font-mono text-label-3">#{displayBadgeNumber(officer.badgeNumber)}</span>
                        </Link>
                        <StatusPill status={officer.apiStatus} compact />
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-label-3">{officer.rank.name}</p>
                      {officer.currentPlayer && (
                          <p className="mt-1 truncate text-[11px] text-label-3">
                            {officer.currentPlayer.name}
                            {officer.currentPlayer.identifier ? ` · ${officer.currentPlayer.identifier}` : ''}
                          </p>
                      )}
                      {officer.apiStatus !== 'online' && officer.lastSeenAt && (
                          <p className="mt-1 text-[11px] text-label-3">
                            Zuletzt: <span className="text-label-2">{formatRelativeTime(officer.lastSeenAt)}</span>
                          </p>
                      )}
                      {officer.apiError && <p className="mt-1 truncate text-[11px] text-red">{officer.apiError}</p>}
                    </div>
                  </div>

                  <MiniBars daily={officer.daily} />

                  <div className="grid grid-cols-2 sm:grid-cols-5 xl:grid-cols-5 gap-2">
                    <Metric label="Woche" value={formatDuration(officer.weekDurationMs)} strong />
                    <Metric label="Gesamt" value={formatDuration(officer.totalDurationMs)} strong />
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

function KpiCard({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: string; accent?: string }) {
  return (
      <div className="stat-card">
        <div className="flex items-center gap-3">
          <div className="stat-icon" style={accent ? { color: accent, borderColor: `${accent}33`, background: `linear-gradient(135deg, ${accent}22, ${accent}05)` } : undefined}>
            <Icon size={17} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="stat-value truncate">{value}</p>
            <p className="stat-label">{label}</p>
          </div>
        </div>
      </div>
  )
}

function Metric({ label, value, strong }: { label: string; value?: string; strong?: boolean }) {
  return (
      <div className="rounded-[8px] bg-canvas border border-line px-3 py-2">
        <p className="text-[11px] font-medium text-label-4">{label}</p>
        <p className={cn('mt-1 truncate text-[12.5px] tabular-nums', strong ? 'font-semibold text-gold' : 'text-label-2')}>{value || '—'}</p>
      </div>
  )
}

function IdentityMetric({ label, value }: { label: string; value?: string | null }) {
  return (
      <div className="rounded-[8px] bg-canvas border border-line px-3 py-2">
        <p className="text-[11px] font-medium text-label-4">{label}</p>
        <p className="mt-1 truncate font-mono text-[11.5px] text-label-2" title={value || undefined}>{value || '—'}</p>
      </div>
  )
}

function StatusPill({ status, compact }: { status: ApiStatus; compact?: boolean }) {
  const online = status === 'online'
  const error = status === 'error'
  return (
      <span className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] whitespace-nowrap',
          compact && 'px-2 py-0.5 text-[11px]',
          online
              ? 'border-green/18 bg-green/8 text-green'
              : error
                  ? 'border-red/15 bg-red/8 text-red'
                  : 'border-line bg-surface text-label-2',
      )}>
      {online ? <span className="live-pulse" /> : <span className={cn('h-1.5 w-1.5 rounded-full', error ? 'bg-red' : 'bg-surface-4')} />}
        {statusLabel(status)}
    </span>
  )
}

function MiniBars({ daily }: { daily: DailyPoint[] }) {
  const max = Math.max(...daily.map((day) => day.durationMs), 1)
  return (
      <div className="grid grid-cols-7 gap-1.5">
        {daily.map((day) => {
          const isToday = new Date(day.date).toDateString() === new Date().toDateString()
          return (
              <div key={`${day.date}-${day.label}`} className="min-w-0 group">
                <div className="flex h-[38px] items-end rounded-[6px] bg-canvas border border-line px-1 transition-colors group-hover:border-gold/30">
                  <div
                      className={cn(
                          'w-full rounded-t-[4px] transition-all',
                          isToday
                              ? 'bg-gold'
                              : 'bg-gradient-to-t from-blue to-cyan',
                      )}
                      style={{ height: Math.max(4, Math.round((day.durationMs / max) * 32)) }}
                      title={`${day.label}: ${day.durationLabel}`}
                  />
                </div>
                <p className={cn('mt-1 truncate text-center text-[11px]', isToday ? 'text-gold font-semibold' : 'text-label-3')}>{day.label}</p>
              </div>
          )
        })}
      </div>
  )
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
      <div className="rounded-[12px] border border-dashed border-line bg-white/[0.03] px-4 py-12 text-center">
        <Icon size={28} className="mx-auto text-gold/40 mb-3" />
        <p className="text-[13px] text-label-2">{text}</p>
      </div>
  )
}
