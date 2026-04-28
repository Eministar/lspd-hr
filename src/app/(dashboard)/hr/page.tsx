'use client'

import { TaskBoard } from '@/components/tasks/task-board'

export default function HrDepartmentPage() {
  return (
    <TaskBoard
      module="HR"
      title="HR Abteilung"
      description="Aufgabenlisten der Personalabteilung – Onboarding, Gespräche, Audits und mehr."
      accentLabel="Personalabteilung"
    />
  )
}
