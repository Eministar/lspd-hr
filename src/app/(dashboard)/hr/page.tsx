'use client'

import Link from 'next/link'
import { ScrollText } from 'lucide-react'

import { TaskBoard } from '@/components/tasks/task-board'

export default function HrDepartmentPage() {
  return (
    <TaskBoard
      module="HR"
      title="HR Abteilung"
      description="Aufgabenlisten der Personalabteilung – Onboarding, Gespräche, Audits und mehr."
      accentLabel="Personalabteilung"
      headerAction={
        <Link
          href="/hr/sanktionskatalog"
          className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[8px] border border-[#234568] px-3 text-[12.5px] font-medium text-[#edf4fb] shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-all duration-150 hover:bg-[#102542]/50 active:scale-[0.98]"
        >
          <ScrollText size={14} strokeWidth={2} />
          Sanktionskatalog
        </Link>
      }
    />
  )
}
