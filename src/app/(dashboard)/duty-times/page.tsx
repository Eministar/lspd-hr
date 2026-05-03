'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { AlertTriangle, Clock3, LogIn, LogOut, RefreshCw, Timer, Users } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Button } from '@/components/ui/button'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/components/ui/toast'
import { cn, formatDateTime } from '@/lib/utils'
import { hasPermission } from '@/lib/permissions'
import { notifyLiveUpdate } from '@/lib/live-updates'

interface DutyOfficer {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  status: string
  rank: { name: string; color: string; sortOrder: number }
  activeSession: { id: string; clockInAt: string; currentDurationMs: number } | null
  activePlaySession: { id: string; startedAt: string; currentDurationMs: number; playerName: string } | null
  weekDurationMs: number
  playtimeWeekDurationMs: number
  verifiedDutyWeekMs: number
  unclockedOnlineWeekMs: number
  dutyWithoutGameWeekMs: number
  honestyScore: number | null
}

interface DutySnapshot {
  now: string
  weekStart: string
  activeCount: number
  totalActiveDurationMs: number
  totalWeekDurationMs: number
  totalPlaytimeWeekDurationMs: number
  totalUnclockedOnlineWeekMs: number
  totalDutyWithoutGameWeekMs: number
  rows: DutyOfficer[]
  activeRows: DutyOfficer[]
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

export default function DutyTimesPage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const { execute } = useApi()
  const canView = hasPermission(user, 'duty-times:view')
  const canManage = hasPermission(user, 'duty-times:manage')
  const { data, loading, error, refetch } = useFetch<DutySnapshot>(canView ? '/api/duty-times' : null)

  const runAction = async (officerId: string, action: 'clock-in' | 'clock-out') => {
    try {
      await execute('/api/duty-times', { method: 'POST', body: JSON.stringify({ officerId, action }) })
      addToast({ type: 'success', title: action === 'clock-in' ? 'Eingestempelt' : 'Ausgestempelt' })
      notifyLiveUpdate()
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Dienstzeiten" description="Live-Übersicht der eingestempelten Officers" />
        <div className="glass-panel-elevated rounded-[14px] p-8 text-center">
          <AlertTriangle size={26} className="mx-auto text-[#f87171] mb-3" />
          <p className="text-[13px] text-[#9fb0c4] mb-4">{error || 'Dienstzeiten konnten nicht geladen werden'}</p>
          <Button size="sm" onClick={refetch}><RefreshCw size={13} /> Erneut laden</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader
        title="Dienstzeiten"
        description="Eingestempelte Officers, aktuelle Dienstzeit und Wochenstunden"
        action={<Button variant="secondary" size="sm" onClick={refetch}><RefreshCw size={13} /> Aktualisieren</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <SummaryCard icon={Users} label="Im Dienst" value={String(data.activeCount)} />
        <SummaryCard icon={Timer} label="Dienst diese Woche" value={formatDuration(data.totalWeekDurationMs)} />
        <SummaryCard icon={Clock3} label="Wach diese Woche" value={formatDuration(data.totalPlaytimeWeekDurationMs)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <SummaryCard icon={AlertTriangle} label="Wach ohne Dienst" value={formatDuration(data.totalUnclockedOnlineWeekMs)} />
        <SummaryCard icon={Clock3} label="Dienst ohne FiveM-Nachweis" value={formatDuration(data.totalDutyWithoutGameWeekMs)} />
      </div>

      <section className="glass-panel-elevated rounded-[14px] p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[13.5px] font-semibold text-[#f7fbff]">Aktuell eingestempelt</h3>
            <p className="text-[12px] text-[#7089a5] mt-1">Woche seit {formatDateTime(data.weekStart)}</p>
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
                    <Link href={`/officers/${officer.id}`} className="text-[14px] font-semibold text-white hover:text-[#d4af37] transition-colors">
                      {officerName(officer)}
                      <span className="ml-1 font-mono text-[#d4af37]">#{officer.badgeNumber}</span>
                    </Link>
                    <p className="text-[12px] text-[#9fb0c4] mt-1">{officer.rank.name}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22c55e]/25 bg-[#052e1b]/60 px-2.5 py-1 text-[11.5px] text-[#86efac]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                    im Dienst
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                  <Metric label="Seit" value={formatDateTime(officer.activeSession?.clockInAt)} />
                  <Metric label="Dienst jetzt" value={formatDuration(officer.activeSession?.currentDurationMs ?? 0)} strong />
                  <Metric label="Wach jetzt" value={officer.activePlaySession ? formatDuration(officer.activePlaySession.currentDurationMs) : 'nicht wach'} />
                  <Metric label="Ehrlich" value={officer.honestyScore === null ? '—' : `${officer.honestyScore}%`} />
                </div>
                {canManage && (
                  <Button className="mt-4 w-full" variant="danger" size="sm" onClick={() => runAction(officer.id, 'clock-out')}>
                    <LogOut size={13} /> Ausstempeln
                  </Button>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-[#1e3a5c]/40 bg-[#0a1e38]/50 px-4 py-10 text-center">
            <Timer size={24} className="mx-auto text-[#d4af37]/35 mb-2" />
            <p className="text-[13px] text-[#8ea4bd]">Aktuell ist kein Officer eingestempelt</p>
          </div>
        )}
      </section>

      <section className="glass-panel-elevated rounded-[14px] p-5">
        <h3 className="text-[13.5px] font-semibold text-[#f7fbff] mb-1">Wochenübersicht</h3>
        <p className="text-[12px] text-[#7089a5] mb-4">
          Alle aktiven Officers: links der Stempelstatus (nicht eingestempelt vs. eingestempelte Zeit), rechts ob die „Wach“-Anzeige aus FiveM.
        </p>
        <div className="divide-y divide-[#d4af37]/10">
          {data.rows.map((officer) => (
            <div key={officer.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={`/officers/${officer.id}`} className="text-[13px] font-medium text-white hover:text-[#d4af37] transition-colors">
                  {officerName(officer)} <span className="font-mono text-[#d4af37]">#{officer.badgeNumber}</span>
                </Link>
                <p className="text-[11.5px] text-[#7089a5] mt-0.5">{officer.rank.name}</p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={cn(
                  'inline-flex min-w-[88px] justify-center rounded-[7px] border px-2.5 py-1.5 text-[12px]',
                  officer.activeSession ? 'border-[#22c55e]/25 bg-[#052e1b]/50 text-[#86efac]' : 'border-[#234568]/60 bg-[#0a1a33]/60 text-[#8ea4bd]',
                )}>
                  {officer.activeSession ? formatDuration(officer.activeSession.currentDurationMs) : 'nicht im Dienst'}
                </span>
                <span className={cn(
                  'inline-flex min-w-[88px] justify-center rounded-[7px] border px-2.5 py-1.5 text-[12px]',
                  officer.activePlaySession ? 'border-[#38bdf8]/25 bg-[#06233a]/50 text-[#93c5fd]' : 'border-[#234568]/60 bg-[#0a1a33]/60 text-[#8ea4bd]',
                )}>
                  {officer.activePlaySession ? 'wach' : 'nicht wach'}
                </span>
                <span className={cn(
                  'min-w-[70px] text-right text-[12.5px] font-semibold tabular-nums',
                  officer.honestyScore !== null && officer.honestyScore < 80 ? 'text-[#fca5a5]' : 'text-[#86efac]',
                )}>
                  {officer.honestyScore === null ? '—' : `${officer.honestyScore}%`}
                </span>
                <span className="min-w-[90px] text-right text-[13px] font-semibold tabular-nums text-[#edf4fb]">
                  {formatDuration(officer.weekDurationMs)} / {formatDuration(officer.playtimeWeekDurationMs)}
                </span>
                {canManage && (
                  officer.activeSession ? (
                    <Button variant="danger" size="sm" onClick={() => runAction(officer.id, 'clock-out')}><LogOut size={13} /></Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => runAction(officer.id, 'clock-in')}><LogIn size={13} /></Button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="glass-panel-elevated rounded-[14px] border border-white/[0.04] p-4">
      <div className="flex items-center gap-3">
        <div className="icon-tile h-10 w-10 rounded-[10px] flex items-center justify-center">
          <Icon size={18} strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-[21px] font-semibold text-white tabular-nums leading-tight">{value}</p>
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
