'use client'

import { motion } from 'framer-motion'
import {
  ChevronRight,
  Edit3,
  Eye,
  Layers3,
  Navigation,
  Plus,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { UnitIcon } from '@/components/units/unit-icon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ColorField } from '@/components/ui/color-field'
import { Input } from '@/components/ui/input'
import { PageLoader } from '@/components/ui/loading'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { useFetch } from '@/hooks/use-fetch'
import { PERMISSIONS, PERMISSION_LABELS, type Permission } from '@/lib/permissions'
import {
  UNIT_ICON_OPTIONS,
  UNIT_MODULES,
  moduleControlledPermissions,
  sanitizeUnitIcon,
  sanitizeUnitModules,
  type UnitIconKey,
  type UnitModuleAccess,
  type UnitModuleKey,
  type UnitModuleSelection,
} from '@/lib/unit-modules'

const MODULE_PERMISSIONS = moduleControlledPermissions()
const EXTRA_PERMISSIONS = PERMISSIONS.filter((permission) => !MODULE_PERMISSIONS.has(permission))
const EXTRA_READ_PERMISSIONS = EXTRA_PERMISSIONS.filter((permission) => permission.endsWith(':view'))
const EXTRA_MANAGE_PERMISSIONS = EXTRA_PERMISSIONS.filter((permission) => !permission.endsWith(':view'))

interface Unit {
  id: string
  key: string
  name: string
  description: string | null
  color: string
  icon: UnitIconKey
  sortOrder: number
  active: boolean
  showInNavigation: boolean
  modules: UnitModuleSelection
  permissions?: Permission[]
}

type UnitForm = {
  name: string
  description: string
  color: string
  icon: UnitIconKey
  sortOrder: number
  active: boolean
  showInNavigation: boolean
  modules: UnitModuleSelection
  permissions: Permission[]
}

function emptyForm(sortOrder = 1): UnitForm {
  return {
    name: '',
    description: '',
    color: '#d4af37',
    icon: 'briefcase',
    sortOrder,
    active: true,
    showInNavigation: true,
    modules: {},
    permissions: [],
  }
}

function selectedModuleEntries(modules: UnitModuleSelection) {
  return UNIT_MODULES.filter((module) => Boolean(modules[module.key]))
}

export default function UnitsPage() {
  const { data: units, loading, refetch } = useFetch<Unit[]>('/api/units')
  const { execute, loading: saving } = useApi()
  const { addToast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [editUnit, setEditUnit] = useState<Unit | null>(null)
  const [form, setForm] = useState<UnitForm>(() => emptyForm())

  const selectedModules = useMemo(() => selectedModuleEntries(form.modules), [form.modules])

  const togglePermission = (permission: Permission, checked: boolean) => {
    setForm((current) => ({
      ...current,
      permissions: checked
        ? Array.from(new Set([...current.permissions, permission]))
        : current.permissions.filter((item) => item !== permission),
    }))
  }

  const toggleModule = (key: UnitModuleKey) => {
    setForm((current) => {
      const next = { ...current.modules }
      if (next[key]) delete next[key]
      else next[key] = 'view'
      return { ...current, modules: next }
    })
  }

  const setModuleAccess = (key: UnitModuleKey, access: UnitModuleAccess) => {
    setForm((current) => ({ ...current, modules: { ...current.modules, [key]: access } }))
  }

  const openCreate = () => {
    setEditUnit(null)
    setForm(emptyForm((units?.length || 0) + 1))
    setModalOpen(true)
  }

  const openEdit = (unit: Unit) => {
    setEditUnit(unit)
    setForm({
      name: unit.name,
      description: unit.description ?? '',
      color: unit.color,
      icon: sanitizeUnitIcon(unit.icon),
      sortOrder: unit.sortOrder,
      active: unit.active,
      showInNavigation: unit.showInNavigation,
      modules: sanitizeUnitModules(unit.modules),
      permissions: (unit.permissions ?? []).filter((permission) => !MODULE_PERMISSIONS.has(permission)),
    })
    setModalOpen(true)
  }

  const saveUnit = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      color: form.color,
      icon: form.icon,
      sortOrder: form.sortOrder,
      active: form.active,
      showInNavigation: form.showInNavigation && selectedModules.length > 0,
      modules: form.modules,
      permissions: form.permissions,
    }
    try {
      if (editUnit) {
        await execute(`/api/units/${editUnit.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        addToast({ type: 'success', title: 'Unit gespeichert', message: 'Navigation und Module wurden aktualisiert.' })
      } else {
        await execute('/api/units', { method: 'POST', body: JSON.stringify(payload) })
        addToast({ type: 'success', title: 'Unit erstellt', message: 'Die Unit kann jetzt Benutzern zugewiesen werden.' })
      }
      setModalOpen(false)
      await refetch()
    } catch (error) {
      addToast({ type: 'error', title: 'Unit konnte nicht gespeichert werden', message: error instanceof Error ? error.message : '' })
    }
  }

  const deleteUnit = async (unit: Unit) => {
    if (!confirm(`Unit „${unit.name}“ wirklich löschen?`)) return
    try {
      await execute(`/api/units/${unit.id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Unit gelöscht' })
      await refetch()
    } catch (error) {
      addToast({ type: 'error', title: 'Unit konnte nicht gelöscht werden', message: error instanceof Error ? error.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Organisation"
        title="Units & Module"
        description="Lege Units frei an und bestimme, welche Arbeitsbereiche ihre Mitglieder erhalten."
        action={<Button size="sm" onClick={openCreate}><Plus size={14} strokeWidth={2.2} /> Neue Unit</Button>}
      />

      <div className="space-y-3">
        {units?.map((unit, index) => {
          const modules = selectedModuleEntries(sanitizeUnitModules(unit.modules))
          return (
            <motion.article
              key={unit.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(index * 0.025, 0.18) }}
              className="group relative overflow-hidden rounded-[15px] border border-[#18385f]/70 bg-[#0a1d37]/68 transition-colors hover:border-[#285078] hover:bg-[#0c213e]"
            >
              <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: unit.color }} />
              <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border bg-[#102744]" style={{ color: unit.color, borderColor: `${unit.color}40` }}>
                    <UnitIcon icon={unit.icon} size={19} strokeWidth={1.9} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[14px] font-semibold text-[#edf4fb]">{unit.name}</h2>
                      <span className="font-mono text-[9.5px] text-[#526d89]">{unit.key}</span>
                      {!unit.active && <span className="rounded-md bg-[#64748b]/10 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-[#8291a5]">Inaktiv</span>}
                      {unit.showInNavigation && <span className="inline-flex items-center gap-1 rounded-md bg-[#34d399]/[0.08] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-[#6ee7b7]"><Navigation size={9} /> Navigation</span>}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-[#67809a]">{unit.description || 'Keine Beschreibung hinterlegt'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 sm:max-w-[42%] sm:justify-end">
                  {modules.map((module) => (
                    <span key={module.key} className="inline-flex items-center gap-1.5 rounded-lg border border-[#1c3b5f]/70 bg-[#081a31]/70 px-2 py-1 text-[10px] text-[#9db0c4]">
                      <UnitIcon icon={module.icon} size={11} style={{ color: unit.color }} />
                      {module.shortLabel}
                    </span>
                  ))}
                  {modules.length === 0 && <span className="text-[10.5px] text-[#516b86]">Keine Module</span>}
                </div>

                <div className="flex shrink-0 items-center gap-1 sm:pl-2">
                  <button type="button" onClick={() => openEdit(unit)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#234568] px-2.5 text-[10.5px] font-semibold text-[#9eb1c6] transition-colors hover:border-[#d4af37]/35 hover:text-[#d4af37]">
                    <Edit3 size={12} /> Bearbeiten
                  </button>
                  <button type="button" onClick={() => void deleteUnit(unit)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5d7690] transition-colors hover:bg-[#fb7185]/10 hover:text-[#fb7185]" aria-label={`${unit.name} löschen`}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </motion.article>
          )
        })}

        {(!units || units.length === 0) && (
          <div className="rounded-[16px] border border-dashed border-[#234568] bg-[#081a31]/45 py-16 text-center">
            <Layers3 size={28} className="mx-auto mb-3 text-[#4f6c89]" strokeWidth={1.5} />
            <p className="text-[13px] font-medium text-[#9eb1c6]">Noch keine Units vorhanden</p>
            <p className="mt-1 text-[11px] text-[#58718c]">Erstelle die erste Unit und weise ihr Arbeitsbereiche zu.</p>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editUnit ? 'Unit bearbeiten' : 'Neue Unit erstellen'} description="Identität, Navigation und Arbeitsbereiche an einer Stelle konfigurieren." size="xl">
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#d4af37]/10 text-[#d4af37]"><Edit3 size={13} /></span>
              <div><h3 className="text-[12.5px] font-semibold text-white">Unit-Profil</h3><p className="text-[10.5px] text-[#607994]">So erscheint die Unit im Dashboard.</p></div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Input label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="z. B. Internal Affairs" required />
              <Input label="Reihenfolge" type="number" value={String(form.sortOrder)} onChange={(event) => setForm({ ...form, sortOrder: Number.parseInt(event.target.value, 10) || 0 })} />
            </div>
            <div className="mt-4">
              <label htmlFor="unit-description" className="mb-1.5 block text-[12.5px] font-medium text-[#9fb0c4]">Beschreibung</label>
              <textarea id="unit-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} placeholder="Wofür ist diese Unit zuständig?" className="w-full resize-none rounded-[9px] border border-[#18385f]/70 bg-[#0a1a33]/60 px-3 py-2.5 text-[13px] leading-5 text-[#edf4fb] outline-none transition-all placeholder:text-[#4a6585] focus:border-[#d4af37] focus:shadow-[0_0_0_3px_rgba(212,175,55,0.08)]" />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr]">
              <ColorField value={form.color} onChange={(color) => setForm({ ...form, color })} />
              <div>
                <p className="mb-2 block text-[12.5px] font-medium text-[#9fb0c4]">Icon</p>
                <div className="grid grid-cols-10 gap-1.5 rounded-xl border border-[#18385f]/60 bg-[#07182e]/55 p-2 max-sm:grid-cols-5">
                  {UNIT_ICON_OPTIONS.map((option) => {
                    const selected = form.icon === option.key
                    return (
                      <button type="button" key={option.key} onClick={() => setForm({ ...form, icon: option.key })} aria-label={option.label} aria-pressed={selected} title={option.label} className={`flex aspect-square items-center justify-center rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/40 ${selected ? 'border-[#d4af37]/55 bg-[#d4af37]/12 text-[#d4af37]' : 'border-transparent text-[#607b96] hover:border-[#284b70] hover:bg-[#102744] hover:text-[#c8d5e3]'}`}>
                        <UnitIcon icon={option.key} size={15} strokeWidth={1.9} />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-[#18385f]/60 bg-[#081a31]/55 px-4 py-3">
              <Checkbox checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} label="Unit aktiv" />
              <Checkbox checked={form.showInNavigation && selectedModules.length > 0} disabled={selectedModules.length === 0} onCheckedChange={(showInNavigation) => setForm({ ...form, showInNavigation })} label="In der Sidebar anzeigen" />
              {selectedModules.length === 0 && <span className="text-[10.5px] text-[#58728d]">Wähle zuerst mindestens ein Modul.</span>}
            </div>
          </section>

          <section className="border-t border-[#18385f]/70 pt-5">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#38bdf8]/10 text-[#7dd3fc]"><Layers3 size={13} /></span>
                <div><h3 className="text-[12.5px] font-semibold text-white">Funktionsmodule</h3><p className="text-[10.5px] text-[#607994]">Mitglieder erhalten die passenden Rechte automatisch.</p></div>
              </div>
              <span className="text-[10px] font-semibold text-[#68819a]">{selectedModules.length} von {UNIT_MODULES.length}</span>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {UNIT_MODULES.map((module) => {
                const access = form.modules[module.key]
                const selected = Boolean(access)
                return (
                  <div key={module.key} className={`relative rounded-[13px] border p-3.5 transition-colors ${selected ? 'border-[#d4af37]/28 bg-[#d4af37]/[0.045]' : 'border-[#18385f]/65 bg-[#081a31]/48 hover:border-[#285078]'}`}>
                    <button type="button" onClick={() => toggleModule(module.key)} className="flex w-full items-start gap-3 text-left">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border ${selected ? 'border-[#d4af37]/30 bg-[#d4af37]/10 text-[#d4af37]' : 'border-[#1f4165] bg-[#102744] text-[#69839e]'}`}><UnitIcon icon={module.icon} size={16} /></span>
                      <span className="min-w-0 flex-1"><span className={`block text-[12px] font-semibold ${selected ? 'text-white' : 'text-[#9db0c4]'}`}>{module.label}</span><span className="mt-1 block text-[10px] leading-4 text-[#5d7690]">{module.description}</span></span>
                      <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border ${selected ? 'border-[#d4af37] bg-[#d4af37] text-[#071b33]' : 'border-[#2a4a6e]'}`}>{selected && <ChevronRight size={11} className="rotate-90" strokeWidth={3} />}</span>
                    </button>

                    {selected && (
                      <div className="mt-3 flex items-center gap-1 border-t border-[#d4af37]/10 pt-2.5">
                        {(['view', 'manage'] as const).map((level) => (
                          <button type="button" key={level} onClick={() => setModuleAccess(module.key, level)} className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[9.5px] font-semibold transition-colors ${access === level ? level === 'manage' ? 'bg-[#d4af37]/14 text-[#d4af37]' : 'bg-[#38bdf8]/12 text-[#7dd3fc]' : 'text-[#607994] hover:bg-[#102744] hover:text-[#aebed0]'}`}>
                            {level === 'manage' ? <Settings2 size={11} /> : <Eye size={11} />}{level === 'manage' ? 'Verwalten' : 'Ansehen'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <details className="group border-t border-[#18385f]/70 pt-5">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-1 py-1 text-[12px] font-semibold text-[#9eb1c6] outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/35">
              <span className="flex items-center gap-2"><SlidersHorizontal size={14} className="text-[#6d87a1]" /> Zusätzliche Einzelrechte</span>
              <span className="flex items-center gap-2 text-[10px] font-normal text-[#58718c]">{form.permissions.length} ausgewählt <ChevronRight size={13} className="transition-transform group-open:rotate-90" /></span>
            </summary>
            <p className="mb-3 mt-2 text-[10.5px] leading-5 text-[#58718c]">Nur für Sonderfälle. Die Rechte der ausgewählten Module werden bereits automatisch gesetzt.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#607994]">Ansehen</p><div className="max-h-48 space-y-1.5 overflow-auto pr-1">{EXTRA_READ_PERMISSIONS.map((permission) => <Checkbox key={permission} checked={form.permissions.includes(permission)} onCheckedChange={(checked) => togglePermission(permission, checked)} label={PERMISSION_LABELS[permission]} className="rounded-lg border border-[#18385f]/50 bg-[#081a31]/45 px-3 py-2" />)}</div></div>
              <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#607994]">Verwalten</p><div className="max-h-48 space-y-1.5 overflow-auto pr-1">{EXTRA_MANAGE_PERMISSIONS.map((permission) => <Checkbox key={permission} checked={form.permissions.includes(permission)} onCheckedChange={(checked) => togglePermission(permission, checked)} label={PERMISSION_LABELS[permission]} className="rounded-lg border border-[#18385f]/50 bg-[#081a31]/45 px-3 py-2" />)}</div></div>
            </div>
          </details>

          <div className="sticky -bottom-6 -mx-6 flex items-center justify-between gap-3 border-t border-[#18385f] bg-[#091b33]/95 px-6 py-4 backdrop-blur-xl">
            <div className="hidden min-w-0 items-center gap-2 text-[10.5px] text-[#5f7893] sm:flex"><UnitIcon icon={form.icon} size={14} style={{ color: form.color }} /><span className="truncate">{form.name.trim() || 'Neue Unit'} · {selectedModules.length} Module</span></div>
            <div className="ml-auto flex gap-2"><Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Abbrechen</Button><Button size="sm" onClick={() => void saveUnit()} disabled={!form.name.trim() || saving}>{saving ? 'Speichert …' : 'Unit speichern'}</Button></div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
