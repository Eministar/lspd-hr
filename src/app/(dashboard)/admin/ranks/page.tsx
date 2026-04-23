'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'

interface Rank { id: string; name: string; sortOrder: number; color: string }

export default function RanksPage() {
  const { data: ranks, loading, refetch } = useFetch<Rank[]>('/api/ranks')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [editRank, setEditRank] = useState<Rank | null>(null)
  const [form, setForm] = useState({ name: '', sortOrder: 0, color: '#3B82F6' })

  const openCreate = () => {
    setForm({ name: '', sortOrder: (ranks?.length || 0) + 1, color: '#3B82F6' })
    setEditRank(null)
    setModalOpen(true)
  }

  const openEdit = (rank: Rank) => {
    setForm({ name: rank.name, sortOrder: rank.sortOrder, color: rank.color })
    setEditRank(rank)
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editRank) {
        await execute(`/api/ranks/${editRank.id}`, { method: 'PATCH', body: JSON.stringify(form) })
        addToast({ type: 'success', title: 'Rang aktualisiert' })
      } else {
        await execute('/api/ranks', { method: 'POST', body: JSON.stringify(form) })
        addToast({ type: 'success', title: 'Rang erstellt' })
      }
      setModalOpen(false)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await execute(`/api/ranks/${id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Rang gelöscht' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Ränge verwalten"
        description="Ränge erstellen, bearbeiten und ordnen"
        action={<Button size="sm" onClick={openCreate}><Plus size={14} strokeWidth={2} /> Neuer Rang</Button>}
      />

      <div className="bg-[#fafafa] dark:bg-[#111] rounded-[12px] overflow-hidden">
        <div className="divide-y divide-[#f0f0f0] dark:divide-[#1a1a1a]">
          {ranks?.map((rank, i) => (
            <motion.div
              key={rank.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#f5f5f5] dark:hover:bg-[#151515] transition-colors"
            >
              <span className="text-[12px] text-[#bbb] font-mono w-6 text-right">{rank.sortOrder}</span>
              <div className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: rank.color }} />
              <span className="flex-1 text-[13.5px] font-medium text-[#111] dark:text-[#eee]">{rank.name}</span>
              <div className="flex gap-0.5">
                <button onClick={() => openEdit(rank)} className="p-1.5 rounded-[6px] hover:bg-[#eee] dark:hover:bg-[#1a1a1a] transition-colors">
                  <Edit size={13} className="text-[#ccc] dark:text-[#555]" />
                </button>
                <button onClick={() => handleDelete(rank.id)} className="p-1.5 rounded-[6px] hover:bg-[#fef2f2] dark:hover:bg-[#1c1111] transition-colors">
                  <Trash2 size={13} className="text-[#ccc] dark:text-[#555] hover:text-[#f87171]" />
                </button>
              </div>
            </motion.div>
          ))}
          {(!ranks || ranks.length === 0) && (
            <div className="text-center py-16">
              <Shield size={28} className="mx-auto mb-3 text-[#ddd] dark:text-[#333]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#999]">Keine Ränge vorhanden</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editRank ? 'Rang bearbeiten' : 'Neuer Rang'}>
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Reihenfolge" type="number" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
          <div className="space-y-1.5">
            <label className="block text-[12.5px] font-medium text-[#888] dark:text-[#777]">Farbe</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-12 rounded-[8px] border border-[#e5e5e5] dark:border-[#2a2a2a] cursor-pointer bg-transparent" />
              <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name.trim()}>Speichern</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
