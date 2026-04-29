'use client'

import { TaskBoard } from '@/components/tasks/task-board'

export default function SruPage() {
  return (
    <TaskBoard
      module="SRU"
      title="SRU"
      description="Aufgabenlisten für SRU-Einsätze, Vorbereitung, Nachbereitung und interne Abläufe."
      accentLabel="Special Response Unit"
    />
  )
}
