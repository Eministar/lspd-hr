'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ScrollText, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { useFetch } from '@/hooks/use-fetch'
import { cn, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { displayBadgeNumber } from '@/lib/badge-number'
import { AUDIT_LOG_GROUPS, groupForAction, type AuditLogGroupKey } from '@/lib/audit-log-groups'

interface AuditLog {
  id: string
  action: string
  oldValue: string | null
  newValue: string | null
  details: string | null
  createdAt: string
  user: { displayName: string } | null
  officer: { firstName: string; lastName: string; badgeNumber: string } | null
}

interface LogResponse {
  logs: AuditLog[]
  total: number
  take: number
  skip: number
}

const actionLabels: Record<string, string> = {
  OFFICER_CREATED: 'Erstellt',
  OFFICER_UPDATED: 'Bearbeitet',
  OFFICER_DELETED: 'Gelöscht',
  OFFICER_PROMOTED: 'Befördert',
  OFFICER_PROMOTION_REVERTED: 'Beförderung rückgängig',
  OFFICER_BADGE_REASSIGNED: 'DN neu vergeben',
  BADGE_NUMBERS_REASSIGNED: 'DN-Neuverteilung',
  OFFICER_TERMINATED: 'Gekündigt',
  OFFICER_SANCTIONED: 'Sanktioniert',
  SANCTION_PAID: 'Sanktion bezahlt',
  SANCTION_UPDATED: 'Sanktion bearbeitet',
  SANCTION_DELETED: 'Sanktion gelöscht',
  SANCTION_ESCALATED_MANUALLY: 'Sanktion eskaliert',
  SANCTION_AUTO_ESCALATED: 'Sanktion auto-eskaliert',
  TRAININGS_UPDATED: 'Ausbildung',
  PROBATION_STARTED: 'Probezeit gestartet',
  PROBATION_UPDATED: 'Probezeit bearbeitet',
  PROBATION_DELETED: 'Probezeit gelöscht',
  NOTE_ADDED: 'Notiz',
  INACTIVITY_NOTE_DISMISSED: 'Fehlzeit-Notiz gelöscht',
  CALENDAR_EVENT_CREATED: 'Termin erstellt',
  CALENDAR_EVENT_UPDATED: 'Termin bearbeitet',
  CALENDAR_EVENT_DELETED: 'Termin gelöscht',
  PATROL_BOARD_CREATED: 'Patrol Board erstellt',
  PATROL_BOARD_UPDATED: 'Patrol Board bearbeitet',
  PATROL_BOARD_DELETED: 'Patrol Board gelöscht',
  API_TOKEN_CREATED: 'API-Token erstellt',
  API_TOKEN_REVOKED: 'API-Token widerrufen',
  API_TOKEN_HARD_DELETED: 'API-Token gelöscht',
  API_TOKENS_LIMIT_UPDATED: 'API-Limit geändert',
}

const groupChipStyles: Record<AuditLogGroupKey | 'other', string> = {
  officer: 'bg-[#10263f] text-[#7fb3e8]',
  rank: 'bg-[#1d2a10] text-[#a3d977]',
  termination: 'bg-[#331416] text-[#e88a8a]',
  sanction: 'bg-[#33240f] text-[#e8b969]',
  training: 'bg-[#122b28] text-[#6fd0c3]',
  probation: 'bg-[#241533] text-[#c39ae8]',
  note: 'bg-[#2b2a12] text-[#d9d276]',
  calendar: 'bg-[#101f33] text-[#8aa8d8]',
  patrol: 'bg-[#0f2d3a] text-[#6cc3e8]',
  system: 'bg-[#22232b] text-[#a3a8c2]',
  other: 'bg-[#0f2340] text-[#888]',
}

export default function LogsPage() {
  const { user } = useAuth()
  const canViewLogs = hasPermission(user, 'logs:view')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const pageSize = 30

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, groupFilter])

  const query = new URLSearchParams({
    take: String(pageSize),
    skip: String(page * pageSize),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(groupFilter ? { group: groupFilter } : {}),
  })
  const { data, loading } = useFetch<LogResponse>(canViewLogs ? `/api/audit-logs?${query.toString()}` : null)

  if (!canViewLogs) return <UnauthorizedContent />
  if (loading && !data) return <PageLoader />

  const logs = data?.logs || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / pageSize)
  const hasFilter = !!debouncedSearch || !!groupFilter

  const filterClass =
    'h-[36px] sm:h-[34px] px-3 rounded-[8px] text-[13px] bg-[#0b1f3a] text-[#b7c5d8] border border-[#18385f]/50 focus:outline-none focus:border-[#d4af37] transition-all'

  return (
    <div>
      <PageHeader title="Protokoll" description={`${total} Einträge${hasFilter ? ' gefunden' : ' insgesamt'}`} />

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6585]"
            strokeWidth={1.75}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name, Dienstnummer, Nutzer oder Details..."
            className={cn(filterClass, 'w-full pl-9 placeholder:text-[#4a6585]')}
          />
        </div>
        <Select
          size="sm"
          value={groupFilter}
          onValueChange={setGroupFilter}
          options={[
            { value: '', label: 'Alle Log-Arten' },
            ...Object.entries(AUDIT_LOG_GROUPS).map(([key, group]) => ({ value: key, label: group.label })),
            { value: 'other', label: 'Sonstiges' },
          ]}
          className="sm:w-[220px]"
        />
      </div>

      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        {logs.length > 0 ? (
          <>
            <div className="divide-y divide-[#18385f]">
              {logs.map((log, i) => {
                const label = actionLabels[log.action] || log.action
                const group = groupForAction(log.action)
                const groupLabel = group === 'other' ? 'Sonstiges' : AUDIT_LOG_GROUPS[group].label
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.015 }}
                    className="flex items-start gap-4 px-5 py-3.5"
                  >
                    <div className="shrink-0 mt-0.5 flex flex-col items-start gap-1">
                      <span className={cn('inline-flex items-center px-2 py-[3px] rounded-[5px] text-[11px] font-medium', groupChipStyles[group])}>
                        {groupLabel}
                      </span>
                      <span className="inline-flex items-center px-2 py-[3px] rounded-[5px] text-[11px] font-medium bg-[#0f2340] text-[#888]">
                        {label}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {log.officer && (
                        <p className="text-[13px] font-medium text-[#eee]">
                          {log.officer.firstName} {log.officer.lastName}
                          <span className="text-[#bbb] font-normal ml-1">({displayBadgeNumber(log.officer.badgeNumber)})</span>
                        </p>
                      )}
                      {log.details && (
                        <p className="text-[12.5px] text-[#888] mt-0.5">{log.details}</p>
                      )}
                      {log.oldValue && log.newValue && (
                        <p className="text-[12px] text-[#aaa] mt-0.5">
                          {log.oldValue} → {log.newValue}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[12px] text-[#999]">{formatDateTime(log.createdAt)}</p>
                      <p className="text-[11px] text-[#4a6585]">{log.user?.displayName ?? 'Gelöscht'}</p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-[#18385f]">
                <p className="text-[12px] text-[#999]">Seite {page + 1} von {totalPages}</p>
                <div className="flex gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                    <ChevronLeft size={13} /> Zurück
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                    Weiter <ChevronRight size={13} />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <ScrollText size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
            <p className="text-[13px] text-[#999]">
              {hasFilter ? 'Keine Treffer für die aktuelle Suche' : 'Keine Protokolleinträge'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
