'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, ChevronDown, Users, Check, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { cn, formatDate, getStatusLabel, getStatusDot } from '@/lib/utils'

interface Training {
  id: string
  key: string
  label: string
  sortOrder: number
}

interface OfficerTraining {
  id: string
  trainingId: string
  completed: boolean
  training: Training
}

interface Rank {
  id: string
  name: string
  sortOrder: number
  color: string
}

interface Officer {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  rank: Rank
  rankId: string
  discordId: string | null
  status: string
  notes: string | null
  hireDate: string
  lastOnline: string | null
  trainings: OfficerTraining[]
}

export default function OfficersPage() {
  const { data: officers, loading, refetch } = useFetch<Officer[]>('/api/officers')
  const { data: ranks } = useFetch<Rank[]>('/api/ranks')
  const { addToast } = useToast()
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rankFilter, setRankFilter] = useState('')
  const [collapsedRanks, setCollapsedRanks] = useState<Set<string>>(new Set())

  const filteredOfficers = useMemo(() => {
    if (!officers) return []
    return officers.filter((o) => {
      if (search) {
        const s = search.toLowerCase()
        if (
          !o.firstName.toLowerCase().includes(s) &&
          !o.lastName.toLowerCase().includes(s) &&
          !o.badgeNumber.toLowerCase().includes(s) &&
          !(o.discordId || '').toLowerCase().includes(s)
        ) return false
      }
      if (statusFilter && o.status !== statusFilter) return false
      if (rankFilter && o.rankId !== rankFilter) return false
      return true
    })
  }, [officers, search, statusFilter, rankFilter])

  const groupedByRank = useMemo(() => {
    const groups: Map<string, { rank: Rank; officers: Officer[] }> = new Map()
    for (const officer of filteredOfficers) {
      const key = officer.rankId
      if (!groups.has(key)) {
        groups.set(key, { rank: officer.rank, officers: [] })
      }
      groups.get(key)!.officers.push(officer)
    }
    return Array.from(groups.values()).sort((a, b) => a.rank.sortOrder - b.rank.sortOrder)
  }, [filteredOfficers])

  const allTrainings = useMemo(() => {
    if (!officers || officers.length === 0) return []
    const first = officers.find(o => o.trainings.length > 0)
    if (!first) return []
    return first.trainings.map(t => t.training).sort((a, b) => a.sortOrder - b.sortOrder)
  }, [officers])

  const toggleRankCollapse = (rankId: string) => {
    setCollapsedRanks(prev => {
      const next = new Set(prev)
      if (next.has(rankId)) next.delete(rankId)
      else next.add(rankId)
      return next
    })
  }

  const handleTrainingToggle = useCallback(async (officerId: string, trainingId: string, completed: boolean) => {
    try {
      const officer = officers?.find(o => o.id === officerId)
      if (!officer) return

      const trainings = officer.trainings.map(t => ({
        trainingId: t.trainingId,
        completed: t.trainingId === trainingId ? completed : t.completed,
      }))

      const res = await fetch(`/api/officers/${officerId}/trainings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainings }),
      })

      if (!res.ok) throw new Error('Fehler')
      await refetch()
    } catch {
      addToast({ type: 'error', title: 'Fehler beim Aktualisieren' })
    }
  }, [officers, refetch, addToast])

  if (loading) return <PageLoader />

  const filterClass = 'h-[34px] px-3 rounded-[8px] text-[13px] bg-[#f5f5f5] dark:bg-[#111] text-[#333] dark:text-[#ccc] border-none focus:outline-none transition-colors'
  const selectChevron = 'cursor-pointer appearance-none pr-8 bg-[url("data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20fill=%27none%27%20viewBox=%270%200%2020%2020%27%3e%3cpath%20stroke=%27%23999%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%20stroke-width=%271.5%27%20d=%27M6%208l4%204%204-4%27/%3e%3c/svg%3e")] bg-[length:1rem_1rem] bg-[right_0.5rem_center] bg-no-repeat'

  const totalActive = officers?.filter(o => o.status === 'ACTIVE').length || 0
  const totalAway = officers?.filter(o => o.status === 'AWAY').length || 0

  return (
    <div>
      <PageHeader
        title="Officers"
        description={`${filteredOfficers.length} Mitarbeiter · ${totalActive} aktiv · ${totalAway} abgemeldet`}
        action={
          <Link href="/officers/new">
            <Button size="sm">
              <Plus size={14} strokeWidth={2} />
              Hinzufügen
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb] dark:text-[#555]" strokeWidth={1.75} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name, Dienstnummer oder Discord..."
            className={cn(filterClass, 'w-full pl-9 placeholder:text-[#bbb] dark:placeholder:text-[#555]')}
          />
        </div>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={cn(filterClass, selectChevron)}>
          <option value="">Alle Status</option>
          <option value="ACTIVE">Aktiv</option>
          <option value="AWAY">Abgemeldet</option>
          <option value="INACTIVE">Inaktiv</option>
          <option value="TERMINATED">Gekündigt</option>
        </select>

        <select value={rankFilter} onChange={(e) => setRankFilter(e.target.value)} className={cn(filterClass, selectChevron)}>
          <option value="">Alle Ränge</option>
          {ranks?.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="rounded-[12px] overflow-hidden">
        {groupedByRank.length === 0 && (
          <div className="text-center py-24">
            <Users size={28} className="mx-auto text-[#ddd] dark:text-[#333] mb-3" strokeWidth={1.5} />
            <p className="text-[13px] text-[#999]">Keine Officers gefunden</p>
          </div>
        )}

        {groupedByRank.map(({ rank, officers: groupOfficers }, groupIndex) => {
          const isCollapsed = collapsedRanks.has(rank.id)
          return (
            <div key={rank.id} className={cn(groupIndex > 0 && 'mt-1')}>
              <button
                onClick={() => toggleRankCollapse(rank.id)}
                className="w-full flex items-center gap-2.5 px-4 py-2 rounded-[8px] hover:bg-[#f5f5f5] dark:hover:bg-[#111] transition-colors group"
              >
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  className={cn(
                    'text-[#bbb] dark:text-[#555] transition-transform duration-200',
                    isCollapsed && '-rotate-90'
                  )}
                />
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: rank.color }} />
                <span className="text-[13px] font-semibold text-[#111] dark:text-[#eee]">{rank.name}</span>
                <span className="text-[12px] text-[#bbb] dark:text-[#555] font-normal">{groupOfficers.length}</span>
              </button>

              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="bg-[#fafafa] dark:bg-[#111] rounded-[10px] overflow-hidden mt-1 mb-2">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-[#aaa] dark:text-[#666] w-16">DN</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-[#aaa] dark:text-[#666]">Name</th>
                            {allTrainings.map((t) => (
                              <th key={t.id} className="px-2.5 py-2.5 text-left text-[11px] font-medium text-[#aaa] dark:text-[#666] whitespace-nowrap">
                                {t.label}
                              </th>
                            ))}
                            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-[#aaa] dark:text-[#666]">Status</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-[#aaa] dark:text-[#666]">Einstellung</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-[#aaa] dark:text-[#666] w-6"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupOfficers.map((officer, i) => (
                            <tr
                              key={officer.id}
                              onClick={() => router.push(`/officers/${officer.id}`)}
                              className={cn(
                                'hover:bg-[#f0f0f0] dark:hover:bg-[#161616] cursor-pointer transition-colors duration-100',
                                i > 0 && 'border-t border-[#f0f0f0] dark:border-[#1a1a1a]'
                              )}
                            >
                              <td className="px-4 py-2.5 font-mono text-[12px] text-[#999] dark:text-[#666]">
                                {officer.badgeNumber}
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span className="text-[13px] font-medium text-[#111] dark:text-[#eee]">
                                  {officer.firstName} {officer.lastName}
                                </span>
                                {officer.discordId && (
                                  <span className="text-[11px] text-[#bbb] dark:text-[#555] font-mono ml-2">{officer.discordId}</span>
                                )}
                              </td>
                              {allTrainings.map((t) => {
                                const ot = officer.trainings.find(ot => ot.trainingId === t.id)
                                const completed = ot?.completed || false
                                return (
                                  <td key={t.id} className="px-2.5 py-2.5" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => handleTrainingToggle(officer.id, t.id, !completed)}
                                      className={cn(
                                        'h-[18px] w-[18px] rounded-[4px] flex items-center justify-center transition-all duration-150',
                                        completed
                                          ? 'bg-[#111] dark:bg-white'
                                          : 'bg-[#eee] dark:bg-[#222] hover:bg-[#ddd] dark:hover:bg-[#2a2a2a]'
                                      )}
                                    >
                                      {completed && <Check size={11} className="text-white dark:text-[#111]" strokeWidth={3} />}
                                    </button>
                                  </td>
                                )
                              })}
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className={cn('h-[6px] w-[6px] rounded-full', getStatusDot(officer.status))} />
                                  <span className="text-[12px] text-[#888]">{getStatusLabel(officer.status)}</span>
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-[12px] text-[#999] dark:text-[#666]">
                                {formatDate(officer.hireDate)}
                              </td>
                              <td className="px-2 py-2.5">
                                {officer.notes && (
                                  <StickyNote size={12} className="text-[#ccc] dark:text-[#444]" strokeWidth={1.75} />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
