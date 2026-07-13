'use client'

import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, PencilLine, Columns2, Eye } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { renderMarkdown } from '@/lib/markdown'
import { ORDNUNG_ICON_NAMES, ordnungIcon } from '@/lib/ordnungen-icons'

export interface OrdnungForm {
  title: string
  description: string
  buttonLabel: string
  icon: string
  content: string
  categoryId: string
}

interface Props {
  open: boolean
  isEditing: boolean
  form: OrdnungForm
  onChange: (patch: Partial<OrdnungForm>) => void
  categoryOptions: { value: string; label: string }[]
  saving: boolean
  onSave: () => void
  onClose: () => void
}

type ViewMode = 'edit' | 'split' | 'preview'

const VIEW_MODES: { key: ViewMode; label: string; icon: typeof PencilLine }[] = [
  { key: 'edit', label: 'Bearbeiten', icon: PencilLine },
  { key: 'split', label: 'Geteilt', icon: Columns2 },
  { key: 'preview', label: 'Vorschau', icon: Eye },
]

function IconGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {ORDNUNG_ICON_NAMES.map((name) => {
        const Icon = ordnungIcon(name)
        const active = name === value
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={`flex items-center justify-center h-9 rounded-[8px] border transition-colors ${
              active
                ? 'border-[#4a8fd8] bg-[#4a8fd8]/15 text-[#7fb2e8]'
                : 'border-[#1e3a5c]/50 text-[#8194a9] hover:border-[#2d5279] hover:text-[#c4d4e6]'
            }`}
            title={name}
          >
            <Icon size={16} strokeWidth={1.75} />
          </button>
        )
      })}
    </div>
  )
}

const EDITOR_TEXTAREA =
  'flex-1 min-h-0 min-w-0 w-full rounded-[10px] bg-[#081729] border border-[#1e3a5c]/60 p-4 text-[13px] leading-relaxed font-mono text-[#e6eef8] resize-none focus:outline-none focus:border-[#2d5279] placeholder:text-[#41597a]'

export function OrdnungEditor({
  open,
  isEditing,
  form,
  onChange,
  categoryOptions,
  saving,
  onSave,
  onClose,
}: Props) {
  const [view, setView] = useState<ViewMode>('split')

  // Beim Öffnen sinnvollen Default je Viewport wählen (schmale Screens: nur Editor).
  useEffect(() => {
    if (!open) return
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setView('edit')
    else setView('split')
  }, [open])

  const html = useMemo(() => renderMarkdown(form.content), [form.content])
  const charCount = form.content.length

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 bg-[#04101f]/70 backdrop-blur-[3px] z-50"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild onOpenAutoFocus={(e) => e.preventDefault()}>
              <motion.div
                initial={{ opacity: 0, scale: 0.985, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.985, y: 8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="fixed inset-2 sm:inset-4 lg:inset-6 z-50 flex flex-col overflow-hidden glass-panel-elevated rounded-[16px]"
              >
                {/* Kopfzeile */}
                <header className="flex items-center gap-3 px-5 py-3.5 border-b border-[#1e3a5c]/45 shrink-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#5f7fa3]">
                      {isEditing ? 'Ordnung bearbeiten' : 'Neue Ordnung'}
                    </p>
                    <Dialog.Title className="text-[15px] font-semibold text-[#f0f5fb] truncate">
                      {form.title.trim() || 'Ohne Titel'}
                    </Dialog.Title>
                    <Dialog.Description className="sr-only">
                      Editor für Ordnungen mit Metadaten und Markdown-Inhalt
                    </Dialog.Description>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                      Abbrechen
                    </Button>
                    <Button size="sm" onClick={onSave} loading={saving} className="gap-1.5">
                      <Save size={14} strokeWidth={2} />
                      Speichern
                    </Button>
                    <Dialog.Close asChild>
                      <button
                        className="ml-1 p-1.5 rounded-[8px] text-[#6b8299] hover:text-[#d4af37] hover:bg-[#102542]/60 transition-colors"
                        aria-label="Schließen"
                      >
                        <X size={16} strokeWidth={2} />
                      </button>
                    </Dialog.Close>
                  </div>
                </header>

                {/* Körper: Metadaten-Spalte + Editor */}
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
                  {/* Metadaten */}
                  <aside className="lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-[#1e3a5c]/45 overflow-y-auto p-5 space-y-4">
                    <Input
                      label="Titel"
                      value={form.title}
                      onChange={(e) => onChange({ title: e.target.value })}
                      placeholder="z. B. Dienstordnung"
                    />
                    <Textarea
                      label="Kurzbeschreibung"
                      rows={2}
                      value={form.description}
                      onChange={(e) => onChange({ description: e.target.value })}
                      placeholder="Wird auf der Übersichtskarte angezeigt"
                    />
                    <Input
                      label="Button-Label"
                      value={form.buttonLabel}
                      onChange={(e) => onChange({ buttonLabel: e.target.value })}
                      placeholder="Optional — sonst wird der Titel verwendet"
                    />
                    <Select
                      label="Kategorie"
                      options={categoryOptions}
                      value={form.categoryId}
                      onValueChange={(v) => onChange({ categoryId: v })}
                      placeholder="Kategorie wählen"
                    />
                    <div>
                      <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-1.5">Icon</p>
                      <IconGrid value={form.icon} onChange={(v) => onChange({ icon: v })} />
                    </div>
                  </aside>

                  {/* Editor */}
                  <section className="flex-1 min-w-0 flex flex-col p-4 gap-3">
                    <div className="flex items-center justify-between gap-3 shrink-0">
                      <div className="inline-flex rounded-[9px] bg-[#0b1c34] border border-[#1e3a5c]/60 p-0.5">
                        {VIEW_MODES.map((m) => {
                          const active = view === m.key
                          const Icon = m.icon
                          return (
                            <button
                              key={m.key}
                              type="button"
                              onClick={() => setView(m.key)}
                              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[7px] text-[12px] font-medium transition-colors ${
                                active
                                  ? 'bg-[#17375f] text-[#edf4fb]'
                                  : 'text-[#7e93ab] hover:text-[#c4d4e6]'
                              }`}
                            >
                              <Icon size={13} strokeWidth={2} />
                              <span className="hidden sm:inline">{m.label}</span>
                            </button>
                          )
                        })}
                      </div>
                      <span className="text-[11.5px] text-[#5f7fa3] tabular-nums">
                        {charCount.toLocaleString('de-DE')} Zeichen
                      </span>
                    </div>

                    <div
                      className={`flex-1 min-h-0 flex gap-3 ${
                        view === 'split' ? 'flex-col md:flex-row' : ''
                      }`}
                    >
                      {view !== 'preview' && (
                        <textarea
                          value={form.content}
                          onChange={(e) => onChange({ content: e.target.value })}
                          placeholder="Markdown-Inhalt …"
                          spellCheck={false}
                          className={EDITOR_TEXTAREA}
                        />
                      )}
                      {view !== 'edit' && (
                        <div
                          className="markdown-document flex-1 min-h-0 min-w-0 overflow-auto rounded-[10px] bg-[#0b1c34]/50 border border-[#1e3a5c]/40 p-4 text-[13px]"
                          dangerouslySetInnerHTML={{ __html: html }}
                        />
                      )}
                    </div>
                  </section>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
