'use client'

import { useState } from 'react'
import { CalendarDays, FileText, ListChecks } from 'lucide-react'
import { ModuleDocuments } from '@/components/modules/module-documents'
import { ModuleCalendar } from '@/components/modules/module-calendar'
import { TaskBoard } from '@/components/tasks/task-board'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { cn } from '@/lib/utils'

type Tab = 'documents' | 'tasks' | 'calendar'

const tabs = [
  { id: 'documents' as const, label: 'Dokumente', icon: FileText },
  { id: 'tasks' as const, label: 'Aufgaben', icon: ListChecks },
  { id: 'calendar' as const, label: 'Kalender', icon: CalendarDays },
]

const EMPTY_DETECTIVE_DOCUMENT = `# Neuer Detective-Bericht

## Sachverhalt

- Punkt 1
- Punkt 2

## Maßnahmen

| Thema | Status | Notiz |
| --- | --- | --- |
|  | Offen |  |
`

export default function DetectivePage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'detective:view')
  const canManage = hasPermission(user, 'detective:manage')
  const [activeTab, setActiveTab] = useState<Tab>('documents')

  if (!canView) return <UnauthorizedContent />

  return (
    <div className="max-w-6xl mx-auto pb-2">
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

      {activeTab === 'documents' && (
        <ModuleDocuments
          module="DETECTIVE"
          title="Detective Dokumente"
          description="Fallnotizen, Ermittlungsberichte und interne Dokumente der Detective Unit"
          emptyDocument={EMPTY_DETECTIVE_DOCUMENT}
          canManage={canManage}
        />
      )}
      {activeTab === 'tasks' && (
        <TaskBoard
          module="DETECTIVE"
          title="Detective Aufgaben"
          description="Aufgabenlisten für Ermittlungen, Fallarbeit und Nachbereitung."
          accentLabel="Detective Unit"
          viewPermission="detective:view"
          managePermission="detective:manage"
        />
      )}
      {activeTab === 'calendar' && (
        <ModuleCalendar
          module="DETECTIVE"
          title="Detective Kalender"
          description="Fallbesprechungen, Briefings und Ermittlungsfristen"
          emptyLabel="Keine Detective-Termine vorhanden"
          createToastTitle="Detective-Termin erstellt"
          deleteToastTitle="Detective-Termin gelöscht"
          eventTypes={[
            { value: 'DETECTIVE_BRIEFING', label: 'Briefing' },
            { value: 'DETECTIVE_CASE', label: 'Fallarbeit' },
            { value: 'MEETING', label: 'Besprechung' },
            { value: 'OTHER', label: 'Sonstiges' },
          ]}
          defaultType="DETECTIVE_BRIEFING"
          color="#0ea5e9"
          canManage={canManage}
        />
      )}
    </div>
  )
}
