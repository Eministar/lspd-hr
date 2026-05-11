'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ClipboardCheck, Plus, RefreshCw, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { cn, formatDate } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'

interface Officer {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string
  status: string
  rank: { name: string }
}

interface ChecklistItem {
  id: string
  label: string
  completed: boolean
}

interface Probation {
  id: string
  startsAt: string
  endsAt: string
  status: 'ACTIVE' | 'PASSED' | 'EXTENDED' | 'FAILED'
  checklist: ChecklistItem[] | null
  resultNote: string | null
  officer: Officer
  createdBy: { displayName: string } | null
  decidedBy: { displayName: string } | null
}

function dateAfterDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function statusLabel(status: Probation['status']) {
  if (status === 'PASSED') return 'Bestanden'
  if (status === 'EXTENDED') return 'Verlängert'
  if (status === 'FAILED') return 'Nicht bestanden'
  return 'Aktiv'
}

function statusClass(status: Probation['status']) {
  if (status === 'PASSED') return 'border-[#166534]/60 bg-[#052e1a]/60 text-[#86efac]'
  if (status === 'FAILED') return 'border-[#7f1d1d]/60 bg-[#2a1212]/60 text-[#fca5a5]'
  if (status === 'EXTENDED') return 'border-[#b45309]/60 bg-[#1d1608]/70 text-[#fbbf24]'
  return 'border-[#234568]/70 bg-[#0a1a33]/70 text-[#93c5fd]'
}

export default function ProbationsPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'probations:view')
  const canManage = hasPermission(user, 'probations:manage')
  const { data: probations, loading, refetch } = useFetch<Probation[]>(canView ? '/api/probations' : null)
  const { data: officers } = useFetch<Officer[]>(canManage ? '/api/officers' : null)
  const { execute } = useApi()
  const { addToast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [resultModal, setResultModal] = useState<Probation | null>(null)
  const [form, setForm] = useState({ officerId: '', startsAt: new Date().toISOString().slice(0, 10), endsAt: dateAfterDays(14) })
  const [result, setResult] = useState({ status: 'PASSED', resultNote: '' })

  const officerOptions = useMemo(() => (officers ?? [])
    .filter((officer) => officer.status !== 'TERMINATED')
    .map((officer) => ({
      value: officer.id,
      label: `${officer.firstName} ${officer.lastName} #${displayBadgeNumber(officer.badgeNumber)} (${officer.rank.name})`,
    })), [officers])

  const createProbation = async () => {
    if (!form.officerId || !form.endsAt) return
    try {
      await execute('/api/probations', { method: 'POST', body: JSON.stringify(form) })
      addToast({ type: 'success', title: 'Probezeit angelegt' })
      setModalOpen(false)
      setForm({ officerId: '', startsAt: new Date().toISOString().slice(0, 10), endsAt: dateAfterDays(14) })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Probezeit konnte nicht angelegt werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const toggleChecklist = async (probation: Probation, itemId: string) => {
    const checklist = (probation.checklist ?? []).map((item) => item.id === itemId ? { ...item, completed: !item.completed } : item)
    try {
      await execute(`/api/probations/${probation.id}`, { method: 'PATCH', body: JSON.stringify({ checklist }) })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Checkliste konnte nicht gespeichert werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const decideProbation = async () => {
    if (!resultModal) return
    try {
      await execute(`/api/probations/${resultModal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: result.status, resultNote: result.resultNote }),
      })
      addToast({ type: 'success', title: 'Probezeit aktualisiert' })
      setResultModal(null)
      setResult({ status: 'PASSED', resultNote: '' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Probezeit konnte nicht aktualisiert werden', message: err instanceof Error ? err.message : '' })
    }
  }

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader
        title="Probezeiten"
        description="Enddatum, Checkliste und Ergebnis pro Rookie verwalten"
        action={(
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={refetch}><RefreshCw size={13} /> Aktualisieren</Button>
            {canManage && <Button size="sm" onClick={() => setModalOpen(true)}><Plus size={13} /> Probezeit</Button>}
          </div>
        )}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {(probations ?? []).map((probation) => {
          const checklist = probation.checklist ?? []
          const completed = checklist.filter((item) => item.completed).length
          const overdue = probation.status === 'ACTIVE' && new Date(probation.endsAt) < new Date()
          return (
            <div key={probation.id} className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/officers/${probation.officer.id}`} className="text-[14px] font-semibold text-white hover:text-[#d4af37]">
                    {probation.officer.firstName} {probation.officer.lastName}
                    <span className="ml-1 font-mono text-[#d4af37]">#{displayBadgeNumber(probation.officer.badgeNumber)}</span>
                  </Link>
                  <p className="mt-1 text-[12px] text-[#8ea4bd]">{probation.officer.rank.name} · {formatDate(probation.startsAt)} bis {formatDate(probation.endsAt)}</p>
                </div>
                <span className={cn('rounded-full border px-2.5 py-1 text-[11.5px] font-semibold', statusClass(probation.status))}>{statusLabel(probation.status)}</span>
              </div>
              {overdue && <p className="mt-3 rounded-[8px] border border-[#7f1d1d]/60 bg-[#2a1212]/60 px-3 py-2 text-[12px] text-[#fca5a5]">Probezeit ist überfällig.</p>}
              <div className="mt-4 space-y-2">
                {checklist.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!canManage || probation.status !== 'ACTIVE'}
                    onClick={() => toggleChecklist(probation, item.id)}
                    className="flex w-full items-center gap-2 rounded-[8px] border border-[#18385f]/55 bg-[#0a1a33]/65 px-3 py-2 text-left text-[12.5px] text-[#c7d4e4] disabled:cursor-default"
                  >
                    {item.completed ? <CheckCircle2 size={15} className="text-[#86efac]" /> : <XCircle size={15} className="text-[#6b8299]" />}
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[12px] text-[#8ea4bd]">{completed}/{checklist.length} erledigt</span>
                {canManage && probation.status === 'ACTIVE' && (
                  <Button size="sm" onClick={() => { setResultModal(probation); setResult({ status: 'PASSED', resultNote: '' }) }}>
                    Ergebnis setzen
                  </Button>
                )}
              </div>
              {probation.resultNote && <p className="mt-3 text-[12.5px] leading-relaxed text-[#b7c5d8]">{probation.resultNote}</p>}
            </div>
          )
        })}
      </div>

      {(probations ?? []).length === 0 && (
        <div className="glass-panel-elevated rounded-[14px] p-12 text-center">
          <ClipboardCheck size={28} className="mx-auto mb-3 text-[#d4af37]/35" />
          <p className="text-[13px] text-[#8ea4bd]">Keine Probezeiten vorhanden</p>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Probezeit anlegen">
        <div className="space-y-4">
          <Select label="Officer" value={form.officerId} onValueChange={(officerId) => setForm({ ...form, officerId })} options={officerOptions} placeholder="Officer wählen..." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Start" type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            <Input label="Ende" type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={createProbation} disabled={!form.officerId || !form.endsAt}>Anlegen</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resultModal} onClose={() => setResultModal(null)} title="Probezeit-Ergebnis">
        <div className="space-y-4">
          <Select
            label="Ergebnis"
            value={result.status}
            onValueChange={(status) => setResult({ ...result, status })}
            options={[
              { value: 'PASSED', label: 'Bestanden' },
              { value: 'EXTENDED', label: 'Verlängert' },
              { value: 'FAILED', label: 'Nicht bestanden' },
            ]}
          />
          <Textarea label="Notiz" value={result.resultNote} onChange={(e) => setResult({ ...result, resultNote: e.target.value })} rows={4} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setResultModal(null)}>Abbrechen</Button>
            <Button size="sm" onClick={decideProbation}>Speichern</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
