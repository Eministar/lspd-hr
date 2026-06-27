'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Clock3, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { PageLoader } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { cn, formatDateTime } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'

// ── Types ───────────────────────────────────────────────────────────────────

interface PatrolRank {
  name: string
  color: string | null
}

interface PatrolOfficer {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string | null
  rank: PatrolRank
  isRookie?: boolean
}

interface PatrolMember {
  id: string
  officer: PatrolOfficer
}

interface PatrolUnit {
  id: string
  name: string
  callSign: string | null
  assignment: string | null
  status: number | null
  scope: string | null
  assignedDispatchId: number | null
  members: PatrolMember[]
}

interface PatrolBoard {
  id: string
  title: string
  patrols: PatrolUnit[]
}

interface DispatchCenter {
  scope: string
  occupiedAt: string | null
  officer: {
    id: string
    firstName: string
    lastName: string
    badgeNumber: string | null
  } | null
}

interface LeaderRow {
  officerId: string
  officer: {
    id: string
    firstName: string
    lastName: string
    badgeNumber: string
  } | null
  totalSeconds: number
  sessionCount: number
}

interface BoardApiResponse {
  success: boolean
  data: {
    activeBoard: PatrolBoard | null
    dispatchCenters: DispatchCenter[]
    syncedAt?: string
  }
}

interface LeaderboardApiResponse {
  success: boolean
  data: LeaderRow[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<number, string> = {
  1: 'Einsatzbereit auf Funk',
  2: 'Einsatzbereit auf Wache',
  3: 'Anfahrt zum Einsatzort',
  4: 'Ankunft am Einsatzort',
  5: 'Sprechwunsch',
  6: 'Nicht verfügbar',
  7: 'Anfahrt zum Zielort',
  8: 'Ankunft am Zielort',
}

function statusLabel(status: number | null | undefined): string | null {
  if (status == null) return null
  return `Status ${status} — ${STATUS_LABELS[status] ?? 'Unbekannt'}`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function officerName(officer: Pick<PatrolOfficer, 'firstName' | 'lastName'>): string {
  return `${officer.firstName} ${officer.lastName}`
}

function initials(officer: Pick<PatrolOfficer, 'firstName' | 'lastName'>): string {
  return `${officer.firstName[0] ?? ''}${officer.lastName[0] ?? ''}`.toUpperCase()
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function PatrolBoardPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'patrol-board:view')

  const [board, setBoard] = useState<PatrolBoard | null>(null)
  const [dispatchCenters, setDispatchCenters] = useState<DispatchCenter[]>([])
  const [leaders, setLeaders] = useState<LeaderRow[]>([])
  const [syncedAt, setSyncedAt] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(0)

  useEffect(() => {
    if (!canView) return
    let active = true

    async function load() {
      try {
        const [boardRes, lbRes] = await Promise.all([
          fetch('/api/patrol-boards').then((r) => r.json()) as Promise<BoardApiResponse>,
          fetch('/api/patrol-time/leaderboard?limit=10').then((r) => r.json()) as Promise<LeaderboardApiResponse>,
        ])
        if (!active) return
        if (boardRes?.success) {
          setBoard(boardRes.data.activeBoard ?? null)
          setDispatchCenters(boardRes.data.dispatchCenters ?? [])
          setSyncedAt(boardRes.data.syncedAt)
        }
        if (lbRes?.success) setLeaders(lbRes.data ?? [])
        setError(null)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Fehler beim Laden')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    const t = setInterval(load, 15_000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [canView, lastRefresh])

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Streifenboard" description="Live-Ansicht · read-only" />
        <div className="glass-panel-elevated rounded-[14px] p-8 text-center">
          <AlertTriangle size={26} className="mx-auto text-[#f87171] mb-3" />
          <p className="text-[13px] text-[#9fb0c4] mb-4">{error}</p>
          <Button size="sm" onClick={() => setLastRefresh(Date.now())}>
            <RefreshCw size={13} /> Erneut laden
          </Button>
        </div>
      </div>
    )
  }

  const activeCount = board?.patrols.reduce((sum, p) => sum + p.members.length, 0) ?? 0
  const patrolCount = board?.patrols.length ?? 0

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="Streifenboard"
        description={
          board
            ? `${patrolCount} Streifen · ${activeCount} Officer eingeteilt`
            : 'Live-Ansicht · read-only'
        }
        action={
          <div className="flex items-center gap-2">
            {syncedAt && (
              <span className="text-[11.5px] text-[#7089a5]">
                Sync {formatDateTime(syncedAt)}
              </span>
            )}
            <span className="rounded-full border border-[#3d2d12]/80 bg-[#1d1608]/70 px-3 py-1 text-[11.5px] font-medium text-[#e8c979]">
              Live von FiveM · read-only
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLastRefresh(Date.now())}
            >
              <RefreshCw size={13} /> Aktualisieren
            </Button>
          </div>
        }
      />

      {/* KPI strip */}
      {board && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="stat-icon"><ShieldCheck size={16} /></div>
              <div>
                <p className="stat-value">{patrolCount}</p>
                <p className="stat-label">Aktive Streifen</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div
                className="stat-icon"
                style={{
                  color: '#22c55e',
                  borderColor: 'rgba(34,197,94,0.3)',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.16), rgba(34,197,94,0.03))',
                }}
              >
                <Users size={16} />
              </div>
              <div>
                <p className="stat-value">{activeCount}</p>
                <p className="stat-label">Eingeteilt</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="stat-icon"><Clock3 size={16} /></div>
              <div>
                <p className="stat-value">{leaders.length}</p>
                <p className="stat-label">Rangliste Einträge</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch centers */}
      {dispatchCenters.length > 0 && (
        <div className="glass-panel-elevated rounded-[14px] p-4 space-y-2">
          <p className="text-[12.5px] font-medium text-[#9fb0c4] mb-3">Leitstellen</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {dispatchCenters.map((dc) => (
              <div
                key={dc.scope}
                className={cn(
                  'rounded-[10px] border px-3 py-2.5 text-[13px]',
                  dc.officer
                    ? 'border-[#234568]/60 bg-[#0a1a33]/60'
                    : 'border-[#1e3a5c]/35 bg-[#061426]/40',
                )}
              >
                <p className="text-[11px] font-medium text-[#7089a5] mb-1">
                  Leitstelle {dc.scope.toUpperCase()}
                </p>
                {dc.officer ? (
                  <p className="font-semibold text-[#edf4fb]">
                    {officerName(dc.officer)}
                    {dc.officer.badgeNumber && (
                      <span className="font-mono text-[#d4af37]">
                        {' '}#{displayBadgeNumber(dc.officer.badgeNumber)}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-[#5f7691]">Nicht besetzt</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patrol grid */}
      {!board || board.patrols.length === 0 ? (
        <div className="glass-panel-elevated rounded-[14px] p-10 text-center">
          <ShieldCheck size={28} className="mx-auto text-[#d4af37]/50 mb-3" />
          <p className="text-[13px] text-[#8ea4bd]">Aktuell keine aktiven Streifen</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {board.patrols.map((patrol) => {
            const label = statusLabel(patrol.status)
            return (
              <div key={patrol.id} className="glass-panel-elevated rounded-[14px] p-4">
                {/* Card header */}
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-[#f7fbff]">
                      {patrol.callSign
                        ? (
                          <>
                            <span className="font-mono text-[#d4af37]">{patrol.callSign}</span>
                            {' '}
                            <span className="text-[#9fb0c4] font-normal text-[12.5px]">{patrol.name}</span>
                          </>
                        )
                        : patrol.name}
                    </h3>
                    {patrol.assignment && (
                      <p className="mt-0.5 text-[11.5px] text-[#8ea4bd]">{patrol.assignment}</p>
                    )}
                  </div>
                  {patrol.assignedDispatchId != null && (
                    <Badge variant="danger">Einsatz #{patrol.assignedDispatchId}</Badge>
                  )}
                </div>

                {/* Status */}
                {label && (
                  <div className="mb-3 rounded-[8px] border border-[#1e3a5c]/45 bg-[#061426]/55 px-3 py-1.5 text-[11.5px] text-[#9fb0c4]">
                    {label}
                  </div>
                )}

                {/* Crew */}
                <div className="rounded-[10px] border border-[#1e3a5c]/45 bg-[#061426]/55 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[12px] font-medium text-[#9fb0c4]">Besatzung</p>
                    <div className="flex items-center gap-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className={cn('cap-dot', i < patrol.members.length && 'is-on')} />
                      ))}
                    </div>
                  </div>

                  {patrol.members.length === 0 ? (
                    <p className="py-3 text-center text-[12px] text-[#5f7691]">Keine Besatzung</p>
                  ) : (
                    <div className="space-y-2">
                      {patrol.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-2.5 rounded-[8px] border border-[#18385f]/30 bg-[#0a1e38]/70 px-2.5 py-2"
                        >
                          <div
                            className="avatar-initials"
                            style={{ width: 26, height: 26, fontSize: 10 }}
                          >
                            {initials(member.officer)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-medium text-white">
                              {member.officer.badgeNumber && (
                                <span className="font-mono text-[#d4af37]">
                                  #{displayBadgeNumber(member.officer.badgeNumber)}{' '}
                                </span>
                              )}
                              {officerName(member.officer)}
                            </p>
                            <p className="truncate text-[10.5px] text-[#7089a5]">
                              {member.officer.rank.name}
                            </p>
                          </div>
                          {member.officer.isRookie && (
                            <span className="shrink-0 rounded-full bg-[#2a2f3a] px-2 py-0.5 text-[10px] text-[#d7dde6]">
                              Rookie
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Leaderboard */}
      {leaders.length > 0 && (
        <div className="glass-panel-elevated rounded-[14px] p-4">
          <h2 className="mb-3 text-[13.5px] font-semibold text-[#f7fbff]">
            Streifenzeit — Rangliste
          </h2>
          <ol className="space-y-2">
            {leaders.map((row, i) => (
              <li
                key={row.officerId}
                className="flex items-center justify-between gap-3 rounded-[9px] border border-[#1e3a5c]/40 bg-[#0a1e38]/50 px-3 py-2 text-[13px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      'w-6 shrink-0 text-center text-[11.5px] font-semibold tabular-nums',
                      i === 0 ? 'text-[#d4af37]' : i === 1 ? 'text-[#9fb0c4]' : i === 2 ? 'text-[#cd7f32]' : 'text-[#5f7691]',
                    )}
                  >
                    {i + 1}.
                  </span>
                  <span className="truncate text-[#edf4fb]">
                    {row.officer
                      ? officerName(row.officer)
                      : row.officerId}
                    {row.officer?.badgeNumber && (
                      <span className="ml-1.5 font-mono text-[11.5px] text-[#d4af37]">
                        #{displayBadgeNumber(row.officer.badgeNumber)}
                      </span>
                    )}
                  </span>
                </div>
                <span className="shrink-0 text-[12px] text-[#7089a5]">
                  {formatDuration(row.totalSeconds)} · {row.sessionCount} Streifen
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
