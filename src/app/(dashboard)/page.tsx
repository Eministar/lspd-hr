'use client'

import { useFetch } from '@/hooks/use-fetch'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { Users, UserCheck, UserMinus, TrendingUp, AlertTriangle, Clock } from 'lucide-react'
import { motion } from 'framer-motion'

interface Stats {
  totalOfficers: number
  activeOfficers: number
  awayOfficers: number
  inactiveOfficers: number
  terminatedOfficers: number
  totalPromotions: number
  recentPromotions: number
  recentTerminations: number
  rankDistribution: { rank: string; color: string; count: number }[]
}

const statCards = [
  { key: 'activeOfficers', label: 'Aktive Officers', icon: UserCheck },
  { key: 'awayOfficers', label: 'Abgemeldet', icon: Clock },
  { key: 'inactiveOfficers', label: 'Inaktiv', icon: AlertTriangle },
  { key: 'totalOfficers', label: 'Gesamt', icon: Users },
  { key: 'recentPromotions', label: 'Beförderungen (30T)', icon: TrendingUp },
  { key: 'recentTerminations', label: 'Kündigungen (30T)', icon: UserMinus },
] as const

export default function DashboardPage() {
  const { data: stats, loading } = useFetch<Stats>('/api/stats')

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader title="Dashboard" description="Übersicht der Personalverwaltung" />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {statCards.map((card, i) => {
          const Icon = card.icon
          const value = stats ? stats[card.key as keyof Stats] : 0
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              className="bg-[#fafafa] dark:bg-[#111] rounded-[12px] p-4 flex items-center gap-3.5"
            >
              <div className="h-9 w-9 rounded-[9px] bg-[#f0f0f0] dark:bg-[#1a1a1a] flex items-center justify-center">
                <Icon size={17} className="text-[#999]" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[22px] font-semibold text-[#111] dark:text-white tabular-nums leading-tight">{value as number}</p>
                <p className="text-[11.5px] text-[#999] mt-0.5">{card.label}</p>
              </div>
            </motion.div>
          )
        })}
      </div>

      {stats && stats.rankDistribution.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.25 }}
          className="bg-[#fafafa] dark:bg-[#111] rounded-[12px] p-5"
        >
          <h3 className="text-[13.5px] font-semibold text-[#111] dark:text-[#eee] mb-5">Rangverteilung</h3>
          <div className="space-y-2.5">
            {stats.rankDistribution.filter(r => r.count > 0).map((rank) => {
              const maxCount = Math.max(...stats.rankDistribution.map(r => r.count), 1)
              const percentage = (rank.count / maxCount) * 100
              return (
                <div key={rank.rank} className="flex items-center gap-3">
                  <div className="w-40 text-[13px] text-[#888] truncate">{rank.rank}</div>
                  <div className="flex-1 h-[22px] bg-[#eee] dark:bg-[#1a1a1a] rounded-[6px] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.6, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-[6px] bg-[#111] dark:bg-[#ddd] flex items-center justify-end pr-2.5"
                      style={{ minWidth: rank.count > 0 ? '1.5rem' : 0 }}
                    >
                      <span className="text-[10px] font-medium text-white dark:text-[#111]">{rank.count}</span>
                    </motion.div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
