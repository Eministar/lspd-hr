'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { useFetch } from '@/hooks/use-fetch'
import { formatDateTime } from '@/lib/utils'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'

interface AuditLog {
  id: string
  action: string
  oldValue: string | null
  newValue: string | null
  details: string | null
  createdAt: string
  user: { displayName: string }
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
  OFFICER_TERMINATED: 'Gekündigt',
  TRAININGS_UPDATED: 'Ausbildung',
  NOTE_ADDED: 'Notiz',
}

export default function LogsPage() {
  const { user } = useAuth()
  const canViewLogs = hasPermission(user, 'logs:view')
  const [page, setPage] = useState(0)
  const pageSize = 30
  const { data, loading } = useFetch<LogResponse>(canViewLogs ? `/api/audit-logs?take=${pageSize}&skip=${page * pageSize}` : null)

  if (!canViewLogs) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  const logs = data?.logs || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <PageHeader title="Protokoll" description={`${total} Einträge insgesamt`} />

      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        {logs.length > 0 ? (
          <>
            <div className="divide-y divide-[#18385f]">
              {logs.map((log, i) => {
                const label = actionLabels[log.action] || log.action
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.015 }}
                    className="flex items-start gap-4 px-5 py-3.5"
                  >
                    <div className="shrink-0 mt-0.5">
                      <span className="inline-flex items-center px-2 py-[3px] rounded-[5px] text-[11px] font-medium bg-[#0f2340] text-[#888]">
                        {label}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {log.officer && (
                        <p className="text-[13px] font-medium text-[#eee]">
                          {log.officer.firstName} {log.officer.lastName}
                          <span className="text-[#bbb] font-normal ml-1">({log.officer.badgeNumber})</span>
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
                      <p className="text-[11px] text-[#4a6585]">{log.user.displayName}</p>
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
            <p className="text-[13px] text-[#999]">Keine Protokolleinträge</p>
          </div>
        )}
      </div>
    </div>
  )
}
