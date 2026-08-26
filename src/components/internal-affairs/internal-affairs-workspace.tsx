'use client'

import { useState } from 'react'
import { FileSearch, FileText } from 'lucide-react'

import { OfficerSearches } from '@/components/internal-affairs/officer-searches'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { ModuleDocuments } from '@/components/modules/module-documents'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { cn } from '@/lib/utils'

const EMPTY_INTERNAL_AFFAIRS_DOCUMENT = `# Neuer Internal-Affairs-Bericht

## Sachverhalt

- Beteiligte
- Anlass

## Feststellungen

| Thema | Ergebnis | Maßnahme |
| --- | --- | --- |
|  |  |  |
`

const tabs = [
  { id: 'documents' as const, label: 'Dokumente', icon: FileText },
  { id: 'searches' as const, label: 'Durchsuchungen', icon: FileSearch },
]

export function InternalAffairsWorkspace() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'internal-affairs:view')
  const canManage = hasPermission(user, 'internal-affairs:manage')
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['id']>('documents')

  if (!canView) return <UnauthorizedContent />

  return (
    <div className="mx-auto max-w-6xl pb-2">
      <div className="mb-5 flex flex-wrap gap-2" aria-label="Internal Affairs Bereiche">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9]/35',
                active
                  ? 'border-[#0ea5e9]/40 bg-[#0ea5e9]/10 text-[#7dd3fc]'
                  : 'border-[#18385f]/60 bg-[#0a1a33]/55 text-[#8ea4bd] hover:border-[#234568] hover:text-white',
              )}
            >
              <Icon size={14} strokeWidth={2} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'documents' && (
        <ModuleDocuments
          module="INTERNAL_AFFAIRS"
          title="Internal Affairs Dokumente"
          description="Fallnotizen, Prüfberichte und interne Vorlagen der Internal Affairs"
          emptyDocument={EMPTY_INTERNAL_AFFAIRS_DOCUMENT}
          canManage={canManage}
        />
      )}
      {activeTab === 'searches' && <OfficerSearches canManage={canManage} />}
    </div>
  )
}
