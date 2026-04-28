'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { UserX, UserPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { formatDate } from '@/lib/utils'

interface Officer {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  rank: { name: string }
  status: string
}

interface Termination {
  id: string
  reason: string
  terminatedAt: string
  previousRank: string | null
  previousBadgeNumber: string | null
  officer: {
    id: string
    firstName: string
    lastName: string
    badgeNumber: string
    status: string
    rank: { name: string; color: string }
  }
  terminatedBy: { displayName: string }
}

export default function TerminationsPage() {
  const { data: terminations, loading, refetch } = useFetch<Termination[]>('/api/terminations')
  const { data: officers, refetch: refetchOfficers } = useFetch<Officer[]>('/api/officers')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [rehireId, setRehireId] = useState<string | null>(null)
  const [createModal, setCreateModal] = useState(false)
  const [selectedOfficerId, setSelectedOfficerId] = useState('')
  const [reason, setReason] = useState('')

  const activeOfficers = officers?.filter(o => o.status !== 'TERMINATED') || []
  const selectedOfficer = activeOfficers.find(o => o.id === selectedOfficerId)

  const handleCreate = async () => {
    if (!selectedOfficerId || !reason.trim()) return
    try {
      await execute('/api/terminations', {
        method: 'POST',
        body: JSON.stringify({ officerId: selectedOfficerId, reason }),
      })
      addToast({ type: 'success', title: 'Kündigung eingetragen' })
      setCreateModal(false)
      setSelectedOfficerId('')
      setReason('')
      await refetch()
      await refetchOfficers()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleRehire = async (officerId: string) => {
    try {
      await execute(`/api/officers/${officerId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      })
      addToast({ type: 'success', title: 'Officer wiedereingestellt' })
      setRehireId(null)
      await refetch()
      await refetchOfficers()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Kündigungen"
        description={`${terminations?.length || 0} Einträge`}
        action={
          <Button size="sm" onClick={() => setCreateModal(true)}>
            <Plus size={14} strokeWidth={2} />
            Neue Kündigung
          </Button>
        }
      />

      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        {terminations && terminations.length > 0 ? (
          <div className="divide-y divide-[#18385f]">
            {terminations.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-start gap-4 px-5 py-4"
              >
                <div className="h-9 w-9 rounded-[9px] bg-[#0f2340] flex items-center justify-center shrink-0 mt-0.5">
                  <UserX size={16} className="text-[#999]" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[13px] font-medium text-[#eee]">
                      {t.officer.firstName} {t.officer.lastName}
                    </p>
                    <span className="text-[11px] text-[#4a6585] font-mono">DN: {t.previousBadgeNumber || t.officer.badgeNumber}</span>
                  </div>
                  <p className="text-[12px] text-[#999] mb-1">
                    Ehem. Rang: <span className="text-[#aaa] font-medium">{t.previousRank || '—'}</span>
                  </p>
                  <p className="text-[13px] text-[#999]">{t.reason}</p>
                  <p className="text-[11px] text-[#4a6585] mt-1.5">
                    {formatDate(t.terminatedAt)} · von {t.terminatedBy.displayName}
                  </p>
                </div>
                <div className="shrink-0">
                  {t.officer.status === 'TERMINATED' ? (
                    <Button variant="secondary" size="sm" onClick={() => setRehireId(t.officer.id)}>
                      <UserPlus size={13} strokeWidth={1.75} />
                      Wiedereinstellen
                    </Button>
                  ) : (
                    <span className="text-[11.5px] text-[#34d399] font-medium">Wiedereingestellt</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <UserX size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
            <p className="text-[13px] text-[#999]">Keine Kündigungen</p>
          </div>
        )}
      </div>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Neue Kündigung" size="md">
        <div className="space-y-4">
          <Select
            label="Officer auswählen"
            value={selectedOfficerId}
            onChange={(e) => setSelectedOfficerId(e.target.value)}
            options={activeOfficers.map(o => ({ value: o.id, label: `${o.badgeNumber} – ${o.firstName} ${o.lastName} (${o.rank.name})` }))}
            placeholder="Officer wählen..."
          />
          {selectedOfficer && (
            <div className="px-3 py-2.5 bg-[#0f2340] rounded-[8px]">
              <p className="text-[13px] text-[#888]">
                <span className="font-medium text-[#eee]">{selectedOfficer.firstName} {selectedOfficer.lastName}</span> · {selectedOfficer.rank.name} · DN {selectedOfficer.badgeNumber}
              </p>
            </div>
          )}
          <Textarea
            label="Kündigungsgrund"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            placeholder="Grund für die Kündigung..."
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setCreateModal(false)}>Abbrechen</Button>
            <Button variant="danger" size="sm" onClick={handleCreate} disabled={!selectedOfficerId || !reason.trim()}>Kündigung eintragen</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!rehireId} onClose={() => setRehireId(null)} title="Officer wiedereinstellen">
        <p className="text-[13px] text-[#888] mb-5">
          Möchten Sie diesen Officer wirklich wiedereinstellen? Der Status wird auf &quot;Aktiv&quot; gesetzt.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRehireId(null)}>Abbrechen</Button>
          <Button size="sm" onClick={() => rehireId && handleRehire(rehireId)}>Wiedereinstellen</Button>
        </div>
      </Modal>
    </div>
  )
}
