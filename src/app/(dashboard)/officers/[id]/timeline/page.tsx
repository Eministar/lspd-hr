'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, History } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Button } from '@/components/ui/button'
import { useFetch } from '@/hooks/use-fetch'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { cn, formatDateTime } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'

interface TimelineItem {
  id: string
  type: string
  title: string
  description: string | null
  createdAt: string
  meta?: Record<string, unknown>
}

interface TimelineResponse {
  officer: {
    id: string
    firstName: string
    lastName: string
    badgeNumber: string
  }
  items: TimelineItem[]
}

function typeClass(type: string) {
  if (type === 'sanction' || type === 'termination') return 'bg-[#dc2626]'
  if (type === 'promotion' || type === 'training') return 'bg-[#22c55e]'
  if (type === 'probation' || type === 'calendar') return 'bg-[#38bdf8]'
  return 'bg-[#d4af37]'
}

export default function OfficerTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const canView = hasPermission(user, 'officers:view')
  const { data, loading } = useFetch<TimelineResponse>(canView ? `/api/officers/${id}/timeline` : null)

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />
  if (!data) return null

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        title="Personalakte"
        description={`${data.officer.firstName} ${data.officer.lastName} #${displayBadgeNumber(data.officer.badgeNumber)}`}
        action={(
          <Link href={`/officers/${id}`}>
            <Button variant="secondary" size="sm"><ArrowLeft size={13} /> Zurück</Button>
          </Link>
        )}
      />

      <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 p-5">
        {data.items.length > 0 ? (
          <div className="relative space-y-4 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-px before:bg-[#1e3a5c]">
            {data.items.map((item) => (
              <div key={item.id} className="relative flex gap-4">
                <span className={cn('relative z-10 mt-1 h-[18px] w-[18px] shrink-0 rounded-full border-2 border-[#061426]', typeClass(item.type))} />
                <div className="min-w-0 flex-1 rounded-[10px] border border-[#18385f]/55 bg-[#0a1a33]/65 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[13.5px] font-semibold text-white">{item.title}</h3>
                    <span className="text-[11.5px] text-[#8ea4bd]">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[#4a6585]">{item.type}</p>
                  {item.description && <p className="mt-2 text-[12.5px] leading-relaxed text-[#c7d4e4]">{item.description}</p>}
                  {item.meta && Object.keys(item.meta).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(item.meta).filter(([, value]) => value !== null && value !== undefined && value !== '').slice(0, 4).map(([key, value]) => (
                        <span key={key} className="rounded-[6px] border border-[#234568]/60 bg-[#061426]/60 px-2 py-1 text-[11px] text-[#8ea4bd]">
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-14 text-center">
            <History size={28} className="mx-auto mb-3 text-[#d4af37]/35" />
            <p className="text-[13px] text-[#8ea4bd]">Noch keine Akteneinträge vorhanden</p>
          </div>
        )}
      </div>
    </div>
  )
}
