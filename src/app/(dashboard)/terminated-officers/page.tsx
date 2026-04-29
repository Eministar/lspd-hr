'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Archive, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/context/auth-context'
import { formatDate, getUnitLabel } from '@/lib/utils'
import { hasPermission } from '@/lib/permissions'
import { officerUnitKeys } from '@/lib/officer-units'

interface Officer {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  status: string
  unit: string | null
  units: string[] | null
  hireDate: string
  rank: { name: string; color: string }
}

interface Unit {
  key: string
  name: string
}

export default function TerminatedOfficersPage() {
  const { data: officers, loading, refetch } = useFetch<Officer[]>('/api/officers?status=TERMINATED')
  const { data: units } = useFetch<Unit[]>('/api/units')
  const { execute } = useApi()
  const { addToast } = useToast()
  const { user } = useAuth()
  const canEdit = hasPermission(user, 'officers:write')

  const unitNames = (officer: Officer) => {
    const keys = officerUnitKeys(officer)
    if (keys.length === 0) return '—'
    return keys.map((key) => units?.find((unit) => unit.key === key)?.name ?? getUnitLabel(key)).join(', ')
  }

  const reactivate = async (officerId: string) => {
    try {
      await execute(`/api/officers/${officerId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      })
      addToast({ type: 'success', title: 'Officer reaktiviert' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Gekündigte Officers"
        description={`${officers?.length || 0} ehemalige Mitarbeiter`}
      />

      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        {officers && officers.length > 0 ? (
          <div className="divide-y divide-[#18385f]">
            {officers.map((officer, i) => (
              <motion.div
                key={officer.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#0f2340] transition-colors"
              >
                <div className="h-9 w-9 rounded-[9px] bg-[#0f2340] flex items-center justify-center shrink-0">
                  <Archive size={16} className="text-[#8ea4bd]" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/officers/${officer.id}`} className="text-[13.5px] font-medium text-[#eee] hover:text-[#d4af37] transition-colors">
                    {officer.firstName} {officer.lastName}
                  </Link>
                  <p className="text-[11.5px] text-[#4a6585]">
                    DN {officer.badgeNumber} · {officer.rank.name} · {unitNames(officer)} · Eingestellt {formatDate(officer.hireDate)}
                  </p>
                </div>
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => reactivate(officer.id)}>
                    <UserCheck size={13} strokeWidth={1.75} />
                    Reaktivieren
                  </Button>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <Archive size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
            <p className="text-[13px] text-[#999]">Keine gekündigten Officers</p>
          </div>
        )}
      </div>
    </div>
  )
}
