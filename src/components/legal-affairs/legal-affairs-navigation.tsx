'use client'

import Link from 'next/link'
import { FileText, Scale } from 'lucide-react'

import { cn } from '@/lib/utils'

export type LegalAffairsSection = 'documents' | 'cases'

const sections: { id: LegalAffairsSection; label: string; href: string; icon: typeof FileText }[] = [
  { id: 'documents', label: 'Dokumente', href: '/lad', icon: FileText },
  { id: 'cases', label: 'Klagen', href: '/lad?tab=cases', icon: Scale },
]

export function LegalAffairsNavigation({ active }: { active: LegalAffairsSection }) {
  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Legal Affairs Bereiche">
      {sections.map((section) => {
        const Icon = section.icon
        const isActive = active === section.id

        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/21',
              isActive
                ? 'border-purple/24 bg-purple/10 text-indigo'
                : 'border-line bg-surface text-label-2 hover:border-line hover:text-label',
            )}
          >
            <Icon size={14} strokeWidth={2} />
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}
