'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'

interface Training { id: string; key: string; label: string; sortOrder: number }

export default function TrainingsPage() {
  const { data: trainings, loading, refetch } = useFetch<Training[]>('/api/trainings')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [editTraining, setEditTraining] = useState<Training | null>(null)
  const [form, setForm] = useState({ key: '', label: '', sortOrder: 0 })

  const openCreate = () => {
    setForm({ key: '', label: '', sortOrder: (trainings?.length || 0) + 1 })
    setEditTraining(null)
    setModalOpen(true)
  }

  const openEdit = (t: Training) => {
    setForm({ key: t.key, label: t.label, sortOrder: t.sortOrder })
    setEditTraining(t)
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editTraining) {
        await execute(`/api/trainings/${editTraining.id}`, { method: 'PATCH', body: JSON.stringify(form) })
        addToast({ type: 'success', title: 'Ausbildung aktualisiert' })
      } else {
        await execute('/api/trainings', { method: 'POST', body: JSON.stringify(form) })
        addToast({ type: 'success', title: 'Ausbildung erstellt' })
      }
      setModalOpen(false)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await execute(`/api/trainings/${id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Ausbildung gelöscht' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Ausbildungen verwalten"
        description="Ausbildungsarten erstellen und bearbeiten"
        action={<Button size="sm" onClick={openCreate}><Plus size={14} strokeWidth={2} /> Neue Ausbildung</Button>}
      />

      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        <div className="divide-y divide-[#18385f]">
          {trainings?.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#0f2340] transition-colors"
            >
              <span className="text-[12px] text-[#bbb] font-mono w-6 text-right">{t.sortOrder}</span>
              <div className="flex-1">
                <span className="text-[13.5px] font-medium text-[#eee]">{t.label}</span>
                <span className="text-[11px] text-[#4a6585] ml-2 font-mono">({t.key})</span>
              </div>
              <div className="flex gap-0.5">
                <button onClick={() => openEdit(t)} className="p-1.5 rounded-[6px] hover:bg-[#0f2340] transition-colors">
                  <Edit size={13} className="text-[#4a6585]" />
                </button>
                <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-[6px] hover:bg-[#1c1111] transition-colors">
                  <Trash2 size={13} className="text-[#4a6585] hover:text-[#f87171]" />
                </button>
              </div>
            </motion.div>
          ))}
          {(!trainings || trainings.length === 0) && (
            <div className="text-center py-16">
              <GraduationCap size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#999]">Keine Ausbildungsarten vorhanden</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTraining ? 'Ausbildung bearbeiten' : 'Neue Ausbildung'}>
        <div className="space-y-4">
          <Input label="Label (Anzeigename)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required placeholder="z.B. Erste Hilfe" />
          <Input label="Key (intern)" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required placeholder="z.B. erste_hilfe" />
          <Input label="Reihenfolge" type="number" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.key.trim() || !form.label.trim()}>Speichern</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
