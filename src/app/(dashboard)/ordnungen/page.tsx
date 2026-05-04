'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ScrollText, FileText, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { useFetch } from '@/hooks/use-fetch'

interface OrdnungConfig {
  id: string
  title: string
  description: string
  category: string
  buttonLabel: string
  file: string
  icon: string
}

const iconMap: { [key: string]: React.ReactNode } = {
  ScrollText: <ScrollText size={16} strokeWidth={2} />,
  FileText: <FileText size={16} strokeWidth={2} />,
}

export default function OrdnungenPage() {
  const { data: configs } = useFetch<OrdnungConfig[]>('/api/ordnungen/config')

  const categories = [
    { key: 'HR', label: 'Human Resources', description: 'Richtlinien und Verfahren für die HR-Abteilung' },
  ]

  return (
    <div className="max-w-6xl mx-auto pb-4">
      <PageHeader
        title="Ordnungen & Richtlinien"
        description="Zentrale Sammlung aller relevanten Dienstordnungen und Richtlinien"
      />

      {categories.map((category, catIdx) => {
        const categoryOrdnungen = configs?.filter(c => c.category === category.key) || []

        return (
          <div key={category.key} className="mb-8">
            <div className="mb-4">
              <h2 className="text-[16px] font-semibold text-[#eee] mb-1">{category.label}</h2>
              <p className="text-[13px] text-[#888]">{category.description}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categoryOrdnungen.map((ordnung, idx) => (
                <motion.div
                  key={ordnung.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: catIdx * 0.1 + idx * 0.05 }}
                >
                  <Link
                    href={`/ordnungen/${ordnung.id}`}
                    className="group flex items-start gap-3 p-4 glass-panel-elevated rounded-[12px] border border-[#1e3a5c]/40 hover:border-[#234568] hover:bg-[#0f2340]/50 transition-all duration-200"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-[8px] bg-[#0f2340] group-hover:bg-[#142d52] transition-colors text-[#4a8fd8] shrink-0">
                      {iconMap[ordnung.icon]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[13.5px] font-semibold text-[#eee] group-hover:text-[#fff] transition-colors">
                        {ordnung.title}
                      </h3>
                      <p className="text-[12px] text-[#888] mt-1">{ordnung.description}</p>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-[#4a6585] group-hover:text-[#6a8fb8] transition-colors shrink-0 mt-1"
                      strokeWidth={2}
                    />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

