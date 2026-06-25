'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ScrollText,
  FileText,
  ArrowRight,
  BookOpen,
  Scale,
  Briefcase,
  Library,
} from 'lucide-react'
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
  ScrollText: <ScrollText size={20} strokeWidth={1.75} />,
  FileText: <FileText size={20} strokeWidth={1.75} />,
}

interface CategoryMeta {
  key: string
  label: string
  description: string
  icon: React.ReactNode
  accent: string
  accentSoft: string
  ring: string
}

const categories: CategoryMeta[] = [
  {
    key: 'Allgemein',
    label: 'Allgemein',
    description: 'Allgemeine Dienstordnungen und verbindliche Richtlinien',
    icon: <Scale size={15} strokeWidth={2} />,
    accent: '#4a8fd8',
    accentSoft: 'rgba(74,143,216,0.14)',
    ring: 'rgba(74,143,216,0.35)',
  },
  {
    key: 'HR',
    label: 'Human Resources',
    description: 'Richtlinien und Verfahren für die HR-Abteilung',
    icon: <Briefcase size={15} strokeWidth={2} />,
    accent: '#d4af37',
    accentSoft: 'rgba(212,175,55,0.14)',
    ring: 'rgba(212,175,55,0.35)',
  },
]

function OrdnungCardSkeleton() {
  return (
    <div className="flex items-start gap-4 p-5 glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/40">
      <div className="w-12 h-12 rounded-[10px] bg-[#0f2340] animate-pulse shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3.5 w-2/5 rounded bg-[#0f2340] animate-pulse" />
        <div className="h-2.5 w-4/5 rounded bg-[#0f2340]/70 animate-pulse" />
        <div className="h-2.5 w-3/5 rounded bg-[#0f2340]/70 animate-pulse" />
      </div>
    </div>
  )
}

export default function OrdnungenPage() {
  const { data: configs } = useFetch<OrdnungConfig[]>('/api/ordnungen/config')
  const isLoading = configs === undefined
  const total = configs?.length ?? 0

  return (
    <div className="max-w-6xl mx-auto pb-6">
      <PageHeader
        title="Ordnungen & Richtlinien"
        description="Zentrale Sammlung aller relevanten Dienstordnungen und Richtlinien"
      />

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden glass-panel-elevated rounded-[16px] border border-[#1e3a5c]/50 p-6 mb-8"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(74,143,216,0.18), transparent 70%)' }}
        />
        <div className="relative flex items-center gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-[14px] bg-gradient-to-br from-[#142d52] to-[#0b1c34] border border-[#234568]/60 text-[#7fb2e8] shrink-0 shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
            <Library size={26} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-[#f0f5fb]">Regelwerk-Bibliothek</h2>
            <p className="text-[13px] text-[#8ea4bd] mt-0.5">
              {isLoading ? 'Lade Ordnungen …' : `${total} Dokumente in ${categories.length} Bereichen`}
            </p>
          </div>
        </div>
      </motion.div>

      {categories.map((category, catIdx) => {
        const categoryOrdnungen = configs?.filter((c) => c.category === category.key) ?? []

        if (!isLoading && categoryOrdnungen.length === 0) return null

        return (
          <div key={category.key} className="mb-9">
            {/* Section header */}
            <div className="flex items-center gap-2.5 mb-4">
              <span
                className="flex items-center justify-center w-7 h-7 rounded-[8px] shrink-0"
                style={{ background: category.accentSoft, color: category.accent }}
              >
                {category.icon}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-[#f0f5fb]">{category.label}</h2>
                  {!isLoading && (
                    <span
                      className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: category.accentSoft, color: category.accent }}
                    >
                      {categoryOrdnungen.length}
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-[#7e93ab] leading-tight">{category.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {isLoading
                ? Array.from({ length: 2 }).map((_, i) => <OrdnungCardSkeleton key={i} />)
                : categoryOrdnungen.map((ordnung, idx) => (
                    <motion.div
                      key={ordnung.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: catIdx * 0.06 + idx * 0.05 }}
                    >
                      <Link
                        href={`/ordnungen/${ordnung.id}`}
                        className="group relative flex items-start gap-4 p-5 glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--accent-ring)] hover:bg-[#0f2340]/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                        style={
                          {
                            '--accent-ring': category.ring,
                            '--accent': category.accent,
                          } as React.CSSProperties
                        }
                      >
                        {/* accent edge */}
                        <span
                          className="absolute left-0 top-5 bottom-5 w-[3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: category.accent }}
                        />
                        <div
                          className="flex items-center justify-center w-12 h-12 rounded-[10px] shrink-0 transition-transform duration-200 group-hover:scale-[1.05]"
                          style={{ background: category.accentSoft, color: category.accent }}
                        >
                          {iconMap[ordnung.icon] ?? <BookOpen size={20} strokeWidth={1.75} />}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <h3 className="text-[14px] font-semibold text-[#eef3f9] group-hover:text-[#fff] transition-colors">
                            {ordnung.title}
                          </h3>
                          <p className="text-[12.5px] text-[#8194a9] mt-1 leading-relaxed line-clamp-2">
                            {ordnung.description}
                          </p>
                          <span className="inline-flex items-center gap-1 mt-2.5 text-[12px] font-medium text-[#6a8fb8] group-hover:text-[var(--accent)] transition-colors">
                            Öffnen
                            <ArrowRight
                              size={13}
                              strokeWidth={2.25}
                              className="transition-transform duration-200 group-hover:translate-x-0.5"
                            />
                          </span>
                        </div>
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
