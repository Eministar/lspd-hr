'use client'

import { forwardRef, useImperativeHandle, useState } from 'react'
import { Plus, FolderPlus } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { ColorField } from '@/components/ui/color-field'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { renderMarkdown } from '@/lib/markdown'
import { ORDNUNG_ICON_NAMES, ordnungIcon } from '@/lib/ordnungen-icons'
import type { OrdnungCategoryDTO, OrdnungenPayload } from '@/lib/ordnungen'

export interface OrdnungenManagerHandle {
  openEditOrdnung: (id: string) => void
  deleteOrdnung: (id: string, title: string) => void
  openEditCategory: (category: OrdnungCategoryDTO) => void
  deleteCategory: (id: string, label: string) => void
}

interface Props {
  payload: OrdnungenPayload
  canManage: boolean
  onChanged: () => void
}

const EMPTY_ORDNUNG = { title: '', description: '', buttonLabel: '', icon: 'FileText', content: '', categoryId: '' }
const EMPTY_CATEGORY = { label: '', description: '', icon: 'Library', color: '#4a8fd8' }

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {ORDNUNG_ICON_NAMES.map((name) => {
        const Icon = ordnungIcon(name)
        const active = name === value
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={`flex items-center justify-center h-9 rounded-[8px] border transition-colors ${active ? 'border-[#4a8fd8] bg-[#4a8fd8]/15 text-[#7fb2e8]' : 'border-[#1e3a5c]/50 text-[#8194a9] hover:border-[#2d5279]'}`}
            title={name}
          >
            <Icon size={16} strokeWidth={1.75} />
          </button>
        )
      })}
    </div>
  )
}

export const OrdnungenManager = forwardRef<OrdnungenManagerHandle, Props>(function OrdnungenManager(
  { payload, canManage, onChanged },
  ref,
) {
  const { execute } = useApi()
  const { addToast } = useToast()

  const [ordnungModalOpen, setOrdnungModalOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingOrdnungId, setEditingOrdnungId] = useState<string | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [ordnungForm, setOrdnungForm] = useState({ ...EMPTY_ORDNUNG })
  const [categoryForm, setCategoryForm] = useState({ ...EMPTY_CATEGORY })
  const [saving, setSaving] = useState(false)

  function openNewOrdnung() {
    setEditingOrdnungId(null)
    setOrdnungForm({ ...EMPTY_ORDNUNG, categoryId: payload.categories[0]?.id ?? '' })
    setOrdnungModalOpen(true)
  }

  function openNewCategory() {
    setEditingCategoryId(null)
    setCategoryForm({ ...EMPTY_CATEGORY })
    setCategoryModalOpen(true)
  }

  useImperativeHandle(ref, () => ({
    async openEditOrdnung(id: string) {
      try {
        const full = (await execute(`/api/ordnungen/${id}`)) as {
          title: string; description: string; buttonLabel: string; icon: string; content: string; categoryId: string
        } | null
        if (!full) return
        setEditingOrdnungId(id)
        setOrdnungForm({
          title: full.title,
          description: full.description,
          buttonLabel: full.buttonLabel,
          icon: full.icon,
          content: full.content,
          categoryId: full.categoryId,
        })
        setOrdnungModalOpen(true)
      } catch (e) {
        addToast({ type: 'error', title: e instanceof Error ? e.message : 'Laden fehlgeschlagen' })
      }
    },
    async deleteOrdnung(id: string, title: string) {
      if (!confirm(`„${title}" wirklich löschen?`)) return
      try {
        await execute(`/api/ordnungen/${id}`, { method: 'DELETE' })
        addToast({ type: 'success', title: 'Ordnung gelöscht' })
        onChanged()
      } catch (e) {
        addToast({ type: 'error', title: e instanceof Error ? e.message : 'Löschen fehlgeschlagen' })
      }
    },
    openEditCategory(category: OrdnungCategoryDTO) {
      setEditingCategoryId(category.id)
      setCategoryForm({
        label: category.label,
        description: category.description ?? '',
        icon: category.icon,
        color: category.color,
      })
      setCategoryModalOpen(true)
    },
    async deleteCategory(id: string, label: string) {
      if (!confirm(`Kategorie „${label}" wirklich löschen?`)) return
      try {
        await execute(`/api/ordnungen/categories/${id}`, { method: 'DELETE' })
        addToast({ type: 'success', title: 'Kategorie gelöscht' })
        onChanged()
      } catch (e) {
        addToast({ type: 'error', title: e instanceof Error ? e.message : 'Löschen fehlgeschlagen' })
      }
    },
  }))

  async function saveOrdnung() {
    if (!ordnungForm.title.trim()) { addToast({ type: 'error', title: 'Titel fehlt' }); return }
    if (!ordnungForm.categoryId) { addToast({ type: 'error', title: 'Kategorie fehlt' }); return }
    setSaving(true)
    try {
      const url = editingOrdnungId ? `/api/ordnungen/${editingOrdnungId}` : '/api/ordnungen'
      await execute(url, { method: editingOrdnungId ? 'PUT' : 'POST', body: JSON.stringify(ordnungForm) })
      addToast({ type: 'success', title: editingOrdnungId ? 'Ordnung gespeichert' : 'Ordnung erstellt' })
      setOrdnungModalOpen(false)
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Fehler beim Speichern' })
    } finally {
      setSaving(false)
    }
  }

  async function saveCategory() {
    if (!categoryForm.label.trim()) { addToast({ type: 'error', title: 'Bezeichnung fehlt' }); return }
    setSaving(true)
    try {
      const url = editingCategoryId ? `/api/ordnungen/categories/${editingCategoryId}` : '/api/ordnungen/categories'
      await execute(url, { method: editingCategoryId ? 'PUT' : 'POST', body: JSON.stringify(categoryForm) })
      addToast({ type: 'success', title: editingCategoryId ? 'Kategorie gespeichert' : 'Kategorie erstellt' })
      setCategoryModalOpen(false)
      setCategoryForm({ ...EMPTY_CATEGORY })
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Fehler beim Speichern' })
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) return null

  const categoryOptions = payload.categories.map((c) => ({ value: c.id, label: c.label }))
  const inputClass = 'w-full h-9 rounded-[8px] bg-[#0b1c34] border border-[#1e3a5c]/60 px-3 text-[13px] text-[#edf4fb]'

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <button
        onClick={openNewOrdnung}
        className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] bg-[#17375f] px-3 text-[12.5px] font-medium text-[#edf4fb] hover:bg-[#1e4675] transition-colors"
      >
        <Plus size={15} strokeWidth={2} /> Neue Ordnung
      </button>
      <button
        onClick={openNewCategory}
        className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] bg-[#102542] px-3 text-[12.5px] font-medium text-[#edf4fb] hover:bg-[#17375f] transition-colors"
      >
        <FolderPlus size={15} strokeWidth={2} /> Neue Kategorie
      </button>

      {/* Ordnung-Editor */}
      <Modal
        open={ordnungModalOpen}
        onClose={() => setOrdnungModalOpen(false)}
        title={editingOrdnungId ? 'Ordnung bearbeiten' : 'Neue Ordnung'}
        size="lg"
      >
        <div className="space-y-3">
          <input
            value={ordnungForm.title}
            onChange={(e) => setOrdnungForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Titel"
            className={inputClass}
          />
          <input
            value={ordnungForm.description}
            onChange={(e) => setOrdnungForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Kurzbeschreibung"
            className={inputClass}
          />
          <input
            value={ordnungForm.buttonLabel}
            onChange={(e) => setOrdnungForm((f) => ({ ...f, buttonLabel: e.target.value }))}
            placeholder="Button-Label (optional, sonst = Titel)"
            className={inputClass}
          />
          <Select
            options={categoryOptions}
            value={ordnungForm.categoryId}
            onValueChange={(v) => setOrdnungForm((f) => ({ ...f, categoryId: v }))}
            placeholder="Kategorie wählen"
          />
          <div>
            <p className="text-[12px] text-[#8194a9] mb-1.5">Icon</p>
            <IconPicker value={ordnungForm.icon} onChange={(v) => setOrdnungForm((f) => ({ ...f, icon: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <textarea
              value={ordnungForm.content}
              onChange={(e) => setOrdnungForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Markdown-Inhalt …"
              className="h-64 rounded-[8px] bg-[#0b1c34] border border-[#1e3a5c]/60 p-3 text-[12.5px] font-mono text-[#edf4fb] resize-none"
            />
            <div
              className="markdown-document h-64 overflow-auto rounded-[8px] bg-[#0b1c34]/50 border border-[#1e3a5c]/40 p-3 text-[12.5px]"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(ordnungForm.content) }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOrdnungModalOpen(false)} className="h-9 px-3 rounded-[8px] bg-[#102542] text-[12.5px] text-[#cdd8e6]">Abbrechen</button>
            <button disabled={saving} onClick={saveOrdnung} className="h-9 px-4 rounded-[8px] bg-[#17375f] text-[12.5px] text-[#edf4fb] disabled:opacity-50">Speichern</button>
          </div>
        </div>
      </Modal>

      {/* Kategorie-Modal */}
      <Modal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={editingCategoryId ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
        size="md"
      >
        <div className="space-y-3">
          <input
            value={categoryForm.label}
            onChange={(e) => setCategoryForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Bezeichnung"
            className={inputClass}
          />
          <input
            value={categoryForm.description}
            onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Beschreibung (optional)"
            className={inputClass}
          />
          <div>
            <p className="text-[12px] text-[#8194a9] mb-1.5">Icon</p>
            <IconPicker value={categoryForm.icon} onChange={(v) => setCategoryForm((f) => ({ ...f, icon: v }))} />
          </div>
          <div>
            <p className="text-[12px] text-[#8194a9] mb-1.5">Farbe</p>
            <ColorField value={categoryForm.color} onChange={(v) => setCategoryForm((f) => ({ ...f, color: v }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setCategoryModalOpen(false)} className="h-9 px-3 rounded-[8px] bg-[#102542] text-[12.5px] text-[#cdd8e6]">Abbrechen</button>
            <button disabled={saving} onClick={saveCategory} className="h-9 px-4 rounded-[8px] bg-[#17375f] text-[12.5px] text-[#edf4fb] disabled:opacity-50">Speichern</button>
          </div>
        </div>
      </Modal>
    </div>
  )
})
