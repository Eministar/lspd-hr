'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Search, Shield } from 'lucide-react'
import { PageLoader } from '@/components/ui/loading'
import { fieldClass } from '@/components/ui/input'
import { useFetch } from '@/hooks/use-fetch'
import { cn, formatDate } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'

interface Officer {
  badgeNumber: string
  firstName: string
  lastName: string
  hireDate: string
  unit: string | null
  units: string[] | null
  unitInfo: { key: string; name: string; color: string }[]
  rank: { name: string; color: string; sortOrder: number }
}

const GRID = 'lg:grid-cols-[88px_minmax(0,1.2fr)_minmax(150px,0.9fr)_minmax(160px,1fr)_120px]'

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
    <main className="min-h-screen bg-canvas px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <Image src="/shield.webp" alt="LSPD" width={48} height={48} priority />
            <div>
              <h1 className="text-[30px] font-bold leading-[1.15] tracking-[-0.03em] text-label">Mitarbeiterliste</h1>
              <p className="mt-0.5 text-[14px] tabular-nums text-label-3">{filtered.length} Mitarbeiter</p>
            </div>
          </div>
          <div className="relative w-full sm:w-[300px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-3" strokeWidth={2} />
            <input
              type="search"
              aria-label="Mitarbeiter durchsuchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen..."
              className={cn(fieldClass, 'h-[34px] pl-8 pr-3')}
            />
          </div>
        </header>

        <div className="lspd-card overflow-hidden">
          {filtered.length > 0 ? (
            <div>
              <div className={cn('hidden gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-[12px] font-medium text-label-3 lg:grid', GRID)}>
                <span>DN</span>
                <span>Name</span>
                <span>Rang</span>
                <span>Unit</span>
                <span>Einstellung</span>
              </div>
              {filtered.map((officer) => (
                <div
                  key={`${officer.badgeNumber}-${officer.firstName}-${officer.lastName}`}
                  className={cn('grid grid-cols-1 gap-1.5 border-b border-line px-5 py-3 transition-colors last:border-b-0 hover:bg-white/[0.025] lg:items-center lg:gap-4', GRID)}
                >
                  <span className="font-mono text-[12.5px] tabular-nums text-label-3">{displayBadgeNumber(officer.badgeNumber)}</span>
                  <p className="min-w-0 truncate text-[14px] font-medium text-label">{officer.firstName} {officer.lastName}</p>
                  <p className="flex min-w-0 items-center gap-2 text-[13px] text-label-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: officer.rank.color }} aria-hidden />
                    <span className="truncate">{officer.rank.name}</span>
                  </p>
                  <span className="flex min-w-0 flex-wrap gap-1">
                    {officer.unitInfo.map((unit) => (
                      <span
                        key={unit.key}
                        className="inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-medium"
                        style={{ color: unit.color, backgroundColor: `color-mix(in srgb, ${unit.color} 16%, transparent)` }}
                      >
                        {unit.name}
                      </span>
                    ))}
                    {officer.unitInfo.length === 0 && <span className="text-[12.5px] text-label-4">Keine Unit</span>}
                  </span>
                  <span className="text-[12.5px] tabular-nums text-label-2">{formatDate(officer.hireDate)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center">
              <Shield size={26} className="mx-auto mb-3 text-label-4" strokeWidth={1.5} />
              <p className="text-[13.5px] text-label-3">Keine Officers gefunden</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
