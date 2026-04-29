'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Search, Shield } from 'lucide-react'
import { PageLoader } from '@/components/ui/loading'
import { useFetch } from '@/hooks/use-fetch'
import { cn, getStatusDot, getStatusLabel } from '@/lib/utils'

interface Officer {
  badgeNumber: string
  firstName: string
  lastName: string
  status: string
  unit: string | null
  units: string[] | null
  unitInfo: { key: string; name: string; color: string }[]
  rank: { name: string; color: string; sortOrder: number }
}

export default function PublicOfficersPage() {
  const { data: officers, loading } = useFetch<Officer[]>('/api/public/officers')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!officers) return []
    if (!s) return officers
    return officers.filter((officer) => (
      officer.firstName.toLowerCase().includes(s) ||
      officer.lastName.toLowerCase().includes(s) ||
      officer.badgeNumber.toLowerCase().includes(s) ||
      officer.rank.name.toLowerCase().includes(s) ||
      officer.unitInfo.some((unit) => unit.name.toLowerCase().includes(s))
    ))
  }, [officers, search])

  if (loading) return <PageLoader />

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-[46px] w-[46px] rounded-[12px] bg-[#0a2040] border border-[#d4af37]/30 flex items-center justify-center overflow-hidden">
              <Image src="/shield.webp" alt="LSPD" width={40} height={40} className="rounded-full" priority />
            </div>
            <div>
              <h1 className="text-[19px] font-semibold text-white tracking-[-0.01em]">Officers</h1>
              <p className="text-[12px] text-[#8ea4bd]">{filtered.length} sichtbare Mitarbeiter</p>
            </div>
          </div>
          <div className="relative w-full sm:w-[300px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6585]" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen..."
              className="h-[36px] w-full rounded-[8px] border border-[#18385f]/70 bg-[#0b1f3a] pl-9 pr-3 text-[13px] text-[#edf4fb] placeholder:text-[#4a6585] focus:outline-none focus:border-[#d4af37]"
            />
          </div>
        </header>

        <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
          {filtered.length > 0 ? (
            <div className="divide-y divide-[#18385f]">
              {filtered.map((officer) => (
                <div key={`${officer.badgeNumber}-${officer.firstName}-${officer.lastName}`} className="flex items-center gap-4 px-4 py-3.5">
                  <span className="w-16 shrink-0 font-mono text-[12px] text-[#b7c5d8]">{officer.badgeNumber}</span>
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: officer.rank.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-[#eee]">{officer.firstName} {officer.lastName}</p>
                    <p className="truncate text-[11.5px] text-[#4a6585]">{officer.rank.name}</p>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1">
                    {officer.unitInfo.map((unit) => (
                      <span
                        key={unit.key}
                        className="inline-flex items-center rounded-full border bg-[#0f2340]/70 px-2 py-[3px] text-[10.5px] font-medium"
                        style={{ color: unit.color, borderColor: `${unit.color}66` }}
                      >
                        {unit.name}
                      </span>
                    ))}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn('h-[6px] w-[6px] rounded-full', getStatusDot(officer.status))} />
                    <span className="text-[12px] text-[#8ea4bd]">{getStatusLabel(officer.status)}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Shield size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#999]">Keine Officers gefunden</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
