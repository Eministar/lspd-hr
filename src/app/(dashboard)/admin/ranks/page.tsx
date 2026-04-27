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

interface Rank {
  id: string
  name: string
  sortOrder: number
  color: string
  badgeMin: number | null
  badgeMax: number | null
  discordRoleId: string | null
}

export default function RanksPage() {
  const { data: ranks, loading, refetch } = useFetch<Rank[]>('/api/ranks')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [editRank, setEditRank] = useState<Rank | null>(null)
  const [form, setForm] = useState({
    name: '',
    sortOrder: 0,
    color: '#3B82F6',
    badgeMin: '' as string,
    badgeMax: '' as string,
    discordRoleId: '' as string,
  })

  const openCreate = () => {
    setForm({
      name: '',
      sortOrder: (ranks?.length || 0) + 1,
      color: '#3B82F6',
      badgeMin: '',
      badgeMax: '',
      discordRoleId: '',
    })
    setEditRank(null)
    setModalOpen(true)
  }

  const openEdit = (rank: Rank) => {
    setForm({
      name: rank.name,
      sortOrder: rank.sortOrder,
      color: rank.color,
      badgeMin: rank.badgeMin != null ? String(rank.badgeMin) : '',
      badgeMax: rank.badgeMax != null ? String(rank.badgeMax) : '',
      discordRoleId: rank.discordRoleId ?? '',
    })
    setEditRank(rank)
    setModalOpen(true)
  }

  const handleSave = async () => {
    const payload = {
      name: form.name,
      sortOrder: form.sortOrder,
      color: form.color,
      badgeMin: form.badgeMin.trim() === '' ? null : form.badgeMin,
      badgeMax: form.badgeMax.trim() === '' ? null : form.badgeMax,
      discordRoleId: form.discordRoleId.trim() === '' ? null : form.discordRoleId.trim(),
    }
    try {
      if (editRank) {
        await execute(`/api/ranks/${editRank.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        addToast({ type: 'success', title: 'Rang aktualisiert' })
      } else {
        await execute('/api/ranks', { method: 'POST', body: JSON.stringify(payload) })
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

      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        <div className="divide-y divide-[#18385f]">
          {ranks?.map((rank, i) => (
            <motion.div
              key={rank.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#0f2340] transition-colors"
            >
              <span className="text-[12px] text-[#bbb] font-mono w-6 text-right">{rank.sortOrder}</span>
              <div className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: rank.color }} />
              <div className="flex-1 min-w-0">
                <span className="text-[13.5px] font-medium text-[#eee]">{rank.name}</span>
                {rank.badgeMin != null && rank.badgeMax != null && (
                  <span className="ml-2 text-[10px] text-[#4a6585] font-mono">DN {rank.badgeMin}–{rank.badgeMax}</span>
                )}
                {rank.discordRoleId && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-[#7c8ad9] font-mono" title={`Discord-Rolle ${rank.discordRoleId}`}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#5865F2]" />
                    {rank.discordRoleId.slice(-6)}
                  </span>
                )}
              </div>
              <div className="flex gap-0.5">
                <button onClick={() => openEdit(rank)} className="p-1.5 rounded-[6px] hover:bg-[#0f2340] transition-colors">
                  <Edit size={13} className="text-[#4a6585]" />
                </button>
                <button onClick={() => handleDelete(rank.id)} className="p-1.5 rounded-[6px] hover:bg-[#1c1111] transition-colors">
                  <Trash2 size={13} className="text-[#4a6585] hover:text-[#f87171]" />
                </button>
              </div>
            </motion.div>
          ))}
          {(!ranks || ranks.length === 0) && (
            <div className="text-center py-16">
              <Shield size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
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
            <label className="block text-[12.5px] font-medium text-[#777]">Farbe</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-12 rounded-[8px] border border-[#18385f] cursor-pointer bg-transparent" />
              <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1" />
            </div>
          </div>
          <p className="text-[11.5px] text-[#6b8299]">
            Dienstnummer-Bereich (nur Zahl, optional): Bei Rangwechsel wird automatisch die kleinste freie Nummer in diesem Bereich vergeben (Einstellungen: Präfix z. B. LSPD-).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="DN von"
              value={form.badgeMin}
              onChange={(e) => setForm({ ...form, badgeMin: e.target.value })}
              placeholder="z. B. 1"
            />
            <Input
              label="DN bis"
              value={form.badgeMax}
              onChange={(e) => setForm({ ...form, badgeMax: e.target.value })}
              placeholder="z. B. 10"
            />
          </div>
          <div className="border-t border-[#18385f] pt-3">
            <Input
              label="Discord Rollen-ID (optional)"
              value={form.discordRoleId}
              onChange={(e) => setForm({ ...form, discordRoleId: e.target.value })}
              placeholder="z. B. 1234567890123456789"
            />
            <p className="text-[11px] text-[#6b8299] mt-1">
              Wird automatisch vergeben, wenn ein Officer auf diesen Rang gesetzt wird. (Discord ID — Rechtsklick auf Rolle → ID kopieren)
            </p>
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
