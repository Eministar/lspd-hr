'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Briefcase, Edit, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'

interface Unit {
  id: string
  key: string
  name: string
  color: string
  sortOrder: number
  active: boolean
}

export default function UnitsPage() {
  const { data: units, loading, refetch } = useFetch<Unit[]>('/api/units')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [editUnit, setEditUnit] = useState<Unit | null>(null)
  const [form, setForm] = useState({ name: '', color: '#d4af37', sortOrder: 0, active: true })

  const openCreate = () => {
    setEditUnit(null)
    setForm({ name: '', color: '#d4af37', sortOrder: (units?.length || 0) + 1, active: true })
    setModalOpen(true)
  }

  const openEdit = (unit: Unit) => {
    setEditUnit(unit)
    setForm({ name: unit.name, color: unit.color, sortOrder: unit.sortOrder, active: unit.active })
    setModalOpen(true)
  }

  const saveUnit = async () => {
    const payload = {
      name: form.name.trim(),
      color: form.color,
      sortOrder: form.sortOrder,
      active: form.active,
    }
    try {
      if (editUnit) {
        await execute(`/api/units/${editUnit.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        addToast({ type: 'success', title: 'Unit aktualisiert' })
      } else {
        await execute('/api/units', { method: 'POST', body: JSON.stringify(payload) })
        addToast({ type: 'success', title: 'Unit erstellt' })
      }
      setModalOpen(false)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const deleteUnit = async (unit: Unit) => {
    if (!confirm(`Unit "${unit.name}" wirklich löschen?`)) return
    try {
      await execute(`/api/units/${unit.id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Unit gelöscht' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Units verwalten"
        description="Units für Officers erstellen und steuern"
        action={<Button size="sm" onClick={openCreate}><Plus size={14} strokeWidth={2} /> Neue Unit</Button>}
      />

      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        <div className="divide-y divide-[#18385f]">
          {units?.map((unit, i) => (
            <motion.div
              key={unit.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#0f2340] transition-colors"
            >
              <span className="text-[12px] text-[#bbb] font-mono w-6 text-right">{unit.sortOrder}</span>
              <div className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: unit.color }} />
              <div className="flex-1 min-w-0">
                <span className="text-[13.5px] font-medium text-[#eee]">{unit.name}</span>
                <span className="text-[11px] text-[#4a6585] ml-2 font-mono">{unit.key}</span>
              </div>
              <span className="text-[11px] text-[#8ea4bd] bg-[#0f2340] px-2 py-[3px] rounded-[5px]">
                {unit.active ? 'Aktiv' : 'Inaktiv'}
              </span>
              <div className="flex gap-0.5">
                <button onClick={() => openEdit(unit)} className="p-1.5 rounded-[6px] hover:bg-[#0f2340] transition-colors">
                  <Edit size={13} className="text-[#4a6585]" />
                </button>
                <button onClick={() => deleteUnit(unit)} className="p-1.5 rounded-[6px] hover:bg-[#1c1111] transition-colors">
                  <Trash2 size={13} className="text-[#4a6585] hover:text-[#f87171]" />
                </button>
              </div>
            </motion.div>
          ))}
          {(!units || units.length === 0) && (
            <div className="text-center py-16">
              <Briefcase size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#999]">Keine Units vorhanden</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editUnit ? 'Unit bearbeiten' : 'Neue Unit'}>
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Reihenfolge" type="number" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
          <div className="space-y-1.5">
            <label className="block text-[12.5px] font-medium text-[#9fb0c4]">Farbe</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-12 rounded-[8px] border border-[#18385f] cursor-pointer bg-transparent" />
              <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1" />
            </div>
          </div>
          <Checkbox checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} label="Unit aktiv" />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={saveUnit} disabled={!form.name.trim()}>Speichern</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
