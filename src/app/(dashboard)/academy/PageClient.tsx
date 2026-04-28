'use client'

import { TaskBoard } from '@/components/tasks/task-board'

export default function AcademyPage() {
  return (
    <TaskBoard
      module="ACADEMY"
      title="Academy"
      description="Ausbildungsaufgaben & To-Do-Listen für Cadets, Field Training und Schulungen."
      accentLabel="Ausbildung & Schulung"
    />
  )
}
