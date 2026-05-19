'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BookOpen, CalendarDays, ListChecks, ScrollText } from 'lucide-react'
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

function HrLinks() {
  return (
    <div className="flex gap-1.5">
      <Link
        href="/ordnungen"
        className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[8px] border border-[#234568] px-3 text-[12.5px] font-medium text-[#edf4fb] shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-all duration-150 hover:bg-[#102542]/50 active:scale-[0.98]"
      >
        <BookOpen size={14} strokeWidth={2} />
        Ordnungen
      </Link>
      <Link
        href="/ordnungen/sanktionskatalog"
        className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[8px] border border-[#234568] px-3 text-[12.5px] font-medium text-[#edf4fb] shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-all duration-150 hover:bg-[#102542]/50 active:scale-[0.98]"
      >
        <ScrollText size={14} strokeWidth={2} />
        Sanktionskatalog
      </Link>
    </div>
  )
}

export default function HrDepartmentPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'hr:view')
  const canManage = hasPermission(user, 'hr:manage')
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
          module="HR"
          title="HR Abteilung"
          description="Aufgabenlisten der Personalabteilung – Onboarding, Gespräche, Audits und mehr."
          accentLabel="Personalabteilung"
          viewPermission="hr:view"
          managePermission="hr:manage"
          headerAction={<HrLinks />}
        />
      )}
      {activeTab === 'calendar' && (
        <ModuleCalendar
          module="HR"
          title="HR Kalender"
          description="Gespräche, Fristen und interne HR-Termine"
          emptyLabel="Keine HR-Termine vorhanden"
          createToastTitle="HR-Termin erstellt"
          deleteToastTitle="HR-Termin gelöscht"
          eventTypes={[
            { value: 'HR_DEADLINE', label: 'HR-Frist' },
            { value: 'MEETING', label: 'Besprechung' },
            { value: 'OTHER', label: 'Sonstiges' },
          ]}
          defaultType="HR_DEADLINE"
          color="#7c3aed"
          canManage={canManage}
        />
      )}
    </div>
  )
}
