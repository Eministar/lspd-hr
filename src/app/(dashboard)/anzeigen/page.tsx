'use client'

import { useEffect, useState } from 'react'
import { FolderOpen, ScrollText } from 'lucide-react'
import { ReportsWorkspace } from '@/components/reports/reports-workspace'
import { PersonFilesWorkspace } from '@/components/reports/person-files-workspace'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { cn } from '@/lib/utils'

type Tab = 'reports' | 'files'

const tabs = [
  { id: 'reports' as const, label: 'Anzeigen', icon: ScrollText },
  { id: 'files' as const, label: 'Personenakten', icon: FolderOpen },
]

function isTab(value: string | null): value is Tab {
  return !!value && tabs.some((tab) => tab.id === value)
}

export default function ReportsPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'reports:view')
  const canManage = hasPermission(user, 'reports:manage')
  const canDelete = hasPermission(user, 'reports:delete')

  const [activeTab, setActiveTab] = useState<Tab>('reports')
  const [personId, setPersonId] = useState<string | null>(null)

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (isTab(tab)) setActiveTab(tab)
  }, [])

  if (!canView) return <UnauthorizedContent />

  return (
    <div className="mx-auto max-w-7xl pb-2">
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-semibold transition-colors',
                active
                  ? 'border-[#d4af37]/45 bg-[#d4af37]/14 text-[#d4af37]'
                  : 'border-[#18385f]/60 bg-[#0a1a33]/55 text-[#8ea4bd] hover:border-[#234568] hover:text-white',
              )}
            >
              <Icon size={14} strokeWidth={2} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'reports' && (
        <ReportsWorkspace canManage={canManage} canDelete={canDelete} />
      )}
      {activeTab === 'files' && (
        <PersonFilesWorkspace
          canManage={canManage}
          canDelete={canDelete}
          selectedId={personId}
          onSelect={setPersonId}
        />
      )}
    </div>
  )
}
