'use client'

import { useState } from 'react'
import { CalendarDays, ListChecks } from 'lucide-react'
import { TaskBoard } from '@/components/tasks/task-board'
import { ModuleCalendar } from '@/components/modules/module-calendar'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { cn } from '@/lib/utils'

type Tab = 'tasks' | 'calendar'

const tabs = [
  { id: 'tasks' as const, label: 'Aufgaben', icon: ListChecks },
  { id: 'calendar' as const, label: 'Kalender', icon: CalendarDays },
]

export default function AcademyPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'academy:view')
  const canManage = hasPermission(user, 'academy:manage')
  const [activeTab, setActiveTab] = useState<Tab>('tasks')

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

      {activeTab === 'tasks' && (
        <TaskBoard
          module="ACADEMY"
          title="Academy"
          description="Ausbildungsaufgaben & To-Do-Listen für Cadets, Field Training und Schulungen."
          accentLabel="Ausbildung & Schulung"
          viewPermission="academy:view"
          managePermission="academy:manage"
        />
      )}
      {activeTab === 'calendar' && (
        <ModuleCalendar
          module="ACADEMY"
          title="Academy Kalender"
          description="Trainings, Prüfungen und Schulungstermine der Academy"
          emptyLabel="Keine Academy-Termine vorhanden"
          createToastTitle="Academy-Termin erstellt"
          deleteToastTitle="Academy-Termin gelöscht"
          eventTypes={[
            { value: 'ACADEMY', label: 'Academy' },
            { value: 'TRAINING', label: 'Training' },
            { value: 'EXAM', label: 'Prüfung' },
            { value: 'MEETING', label: 'Besprechung' },
            { value: 'OTHER', label: 'Sonstiges' },
          ]}
          defaultType="ACADEMY"
          color="#d4af37"
          canManage={canManage}
        />
      )}
    </div>
  )
}
