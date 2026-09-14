'use client'

import Link from 'next/link'
import { FileSearch, FileText, FolderOpen, ScrollText, UserX } from 'lucide-react'

import { cn } from '@/lib/utils'

export type InternalAffairsSection =
  | 'documents'
  | 'searches'
  | 'investigations'
  | 'person-files'
  | 'terminations'

const sections: { id: InternalAffairsSection; label: string; href: string; icon: typeof FileText }[] = [
  { id: 'documents', label: 'Dokumente', href: '/internal-affairs', icon: FileText },
  { id: 'searches', label: 'Durchsuchungen', href: '/internal-affairs?tab=searches', icon: FileSearch },
  { id: 'investigations', label: 'DAWs & Ermittlungen', href: '/internal-affairs/investigations', icon: ScrollText },
  { id: 'person-files', label: 'Personenakten', href: '/internal-affairs/person-files', icon: FolderOpen },
  { id: 'terminations', label: 'Kündigungen', href: '/internal-affairs/terminations', icon: UserX },
]

export function InternalAffairsNavigation({ active }: { active: InternalAffairsSection }) {
  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Internal Affairs Bereiche">
      {sections.map((section) => {
        const Icon = section.icon
        const isActive = active === section.id

        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/21',
              isActive
                ? 'border-cyan/24 bg-cyan/10 text-cyan'
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
