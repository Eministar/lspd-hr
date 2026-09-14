'use client'

import { motion, Reorder, useDragControls } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Edit3,
  Eye,
  GripVertical,
  Layers3,
  Navigation,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { UnitIcon } from '@/components/units/unit-icon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ColorField } from '@/components/ui/color-field'
import { Input } from '@/components/ui/input'
import { PageLoader } from '@/components/ui/loading'
import { Modal } from '@/components/ui/modal'
import { Select, type SelectOption } from '@/components/ui/select'
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
import { cn } from '@/lib/utils'
import { hasMissingUnitGroup, matchesSearch } from '@/lib/admin-search'

const MODULE_PERMISSIONS = moduleControlledPermissions()
const EXTRA_PERMISSIONS = PERMISSIONS.filter((permission) => !MODULE_PERMISSIONS.has(permission))
const EXTRA_READ_PERMISSIONS = EXTRA_PERMISSIONS.filter((permission) => permission.endsWith(':view'))
const EXTRA_MANAGE_PERMISSIONS = EXTRA_PERMISSIONS.filter((permission) => !permission.endsWith(':view'))

type Unit = {
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
  discordRoleId: string | null
  groupId: string | null
  isLeadership: boolean
  assignmentCounts?: { officers: number; directUsers: number }
}

type UnitGroup = {
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
  memberDiscordRoleId: string | null
  leadershipDiscordRoleId: string | null
  assignmentCounts?: { officers: number; directUsers: number }
  units: Unit[]
}

type GroupForm = {
  name: string
  description: string
  color: string
  icon: UnitIconKey
  sortOrder: number
  active: boolean
  showInNavigation: boolean
  modules: UnitModuleSelection
  permissions: Permission[]
  memberDiscordRoleId: string
  leadershipDiscordRoleId: string
}

type UnitForm = {
  name: string
  description: string
  color: string
  icon: UnitIconKey
  sortOrder: number
  active: boolean
  groupId: string
  isLeadership: boolean
  discordRoleId: string
}

type DiscordRole = { id: string; name: string; managed?: boolean; position?: number }
type DiscordResponse = { roles?: DiscordRole[] }

const GROUP_STEPS = [
  { label: 'Identität', description: 'Name & Erscheinung' },
  { label: 'Arbeitsbereiche', description: 'Module für alle Ränge' },
  { label: 'Rollen & Start', description: 'Navigation & Discord' },
] as const

function emptyGroupForm(sortOrder = 10): GroupForm {
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
    memberDiscordRoleId: '',
    leadershipDiscordRoleId: '',
  }
}

function emptyUnitForm(groupId = '', sortOrder = 10): UnitForm {
  return {
    name: '',
    description: '',
    color: '#5d7690',
    icon: 'badge',
    sortOrder,
    active: true,
    groupId,
    isLeadership: false,
    discordRoleId: '',
  }
}

function selectedModuleEntries(modules: UnitModuleSelection) {
  return UNIT_MODULES.filter((module) => Boolean(modules[module.key]))
}

function AccessBadge({ access }: { access: UnitModuleAccess }) {
  const manage = access === 'manage'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        manage ? 'bg-gold/10 text-gold' : 'bg-cyan/10 text-cyan',
      )}
    >
      {manage ? <Settings2 size={9} /> : <Eye size={9} />}
      {manage ? 'Bearbeiten' : 'Ansehen'}
    </span>
  )
}

function ToggleSetting({
  checked,
  disabled = false,
  title,
  description,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  title: string
  description: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-4 rounded-[12px] border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong disabled:pointer-events-none disabled:opacity-45"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-label">{title}</span>
        <span className="mt-1 block text-[11px] leading-4 text-label-3">{description}</span>
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
          checked ? 'border-gold/70 bg-gold/25' : 'border-line bg-surface-2',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-[18px] w-[18px] rounded-full transition-transform',
            checked ? 'translate-x-[20px] bg-gold' : 'translate-x-0.5 bg-surface-4',
          )}
        />
      </span>
    </button>
  )
}

function UnitFlowExplanation() {
  const steps = [
    { icon: Layers3, title: 'Unitgruppe anlegen', text: 'Ein gemeinsamer Bereich für ein Team' },
    { icon: ShieldCheck, title: 'Ränge hinzufügen', text: 'Beliebig viele Unterunits definieren' },
    { icon: Users, title: 'Leitung markieren', text: 'Rolle wird automatisch synchronisiert' },
  ]
  return (
    <section className="mb-6 overflow-hidden rounded-[16px] border border-line bg-[linear-gradient(120deg,rgba(10,31,57,0.96),rgba(7,24,46,0.8))]">
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <p className="text-[11px] font-bold text-cyan/80">Das neue Modell</p>
        <h2 className="mt-1 text-[14px] font-semibold text-label">Eine Gruppe bündelt Navigation, Module und Ränge</h2>
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center sm:p-5">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <div key={step.title} className="contents">
              <div className="flex items-center gap-3 rounded-[12px] border border-line bg-surface p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gold/10 text-gold">
                  <Icon size={16} strokeWidth={1.9} />
                </span>
                <span>
                  <span className="block text-[11px] font-semibold text-label">{step.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-label-3">{step.text}</span>
                </span>
              </div>
              {index < steps.length - 1 && (
                <ArrowRight className="mx-auto rotate-90 text-label-4 sm:rotate-0" size={15} />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ModuleChips({ modules, color }: { modules: UnitModuleSelection; color: string }) {
  const entries = selectedModuleEntries(modules)
  if (entries.length === 0) return <span className="text-[11px] text-label-3">Keine Arbeitsbereiche</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((module) => (
        <span
          key={module.key}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-line bg-surface px-2 py-1.5 text-[11px] text-label-2"
        >
          <UnitIcon icon={module.icon} size={11} style={{ color }} />
          {module.shortLabel}
          <AccessBadge access={modules[module.key] ?? 'view'} />
        </span>
      ))}
    </div>
  )
}

function SubRankReorderItem({
  unit,
  onEdit,
}: {
  unit: Unit
  onEdit: () => void
}) {
  const controls = useDragControls()
  const unitCounts = unit.assignmentCounts ?? { officers: 0, directUsers: 0 }

  return (
    <Reorder.Item
      value={unit}
      dragListener={false}
      dragControls={controls}
      className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface p-3 select-none transition-shadow sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onPointerDown={(e) => controls.start(e)}
          className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-[8px] border border-line bg-surface text-label-4 transition-colors hover:border-line-strong hover:text-label-2 active:cursor-grabbing"
          title="Reihenfolge verschieben"
          aria-label="Reihenfolge verschieben"
        >
          <GripVertical size={15} />
        </button>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border bg-surface-2"
          style={{ color: unit.color, borderColor: `${unit.color}40` }}
        >
          <UnitIcon icon={unit.icon} size={15} />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[11.5px] font-semibold text-label">{unit.name}</span>
            {unit.isLeadership && (
              <span className="inline-flex items-center gap-1 rounded-md bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold text-gold">
                <ShieldCheck size={9} /> Leitung
              </span>
            )}
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                unit.active ? 'bg-green/[0.08] text-green' : 'bg-white/[0.03] text-label-3',
              )}
            >
              {unit.active ? 'aktiv' : 'inaktiv'}
            </span>
          </span>
          <span className="mt-1 block font-mono text-[11px] text-label-4">
            {unit.key}
            {unit.discordRoleId ? ` · Discord ${unit.discordRoleId}` : ''}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-label-3">
        <span className="inline-flex items-center gap-1">
          <Users size={11} /> {unitCounts.officers}
        </span>
        <span className="inline-flex items-center gap-1">
          <UserCog size={11} /> {unitCounts.directUsers}
        </span>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-line px-2.5 text-[11px] font-semibold text-label-2 transition-colors hover:border-gold/35 hover:text-gold-bright"
      >
        <Edit3 size={12} /> Rang bearbeiten
      </button>
    </Reorder.Item>
  )
}

export default function UnitsPage() {
  const { data: units, loading: unitsLoading, error: unitsError, refetch: refetchUnits } = useFetch<Unit[]>('/api/units?includeCounts=true')
  const { data: groups, loading: groupsLoading, error: groupsError, refetch: refetchGroups } = useFetch<UnitGroup[]>('/api/unit-groups')
  const { data: discordData } = useFetch<DiscordResponse>('/api/discord/config')
  const { execute, loading: saving } = useApi()
  const { addToast } = useToast()
  const [localGroups, setLocalGroups] = useState<UnitGroup[]>([])
  const [query, setQuery] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<UnitGroup | null>(null)
  const [groupForm, setGroupForm] = useState<GroupForm>(() => emptyGroupForm())
  const [groupStep, setGroupStep] = useState(0)
  const [unitModalOpen, setUnitModalOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const [unitForm, setUnitForm] = useState<UnitForm>(() => emptyUnitForm())

  useEffect(() => {
    if (groups) setLocalGroups(groups)
  }, [groups])

  const roles = useMemo<SelectOption[]>(() => [
    { value: '', label: 'Keine Discord-Rolle' },
    ...(discordData?.roles ?? []).filter((role) => !role.managed).sort((a, b) => (b.position ?? 0) - (a.position ?? 0)).map((role) => ({ value: role.id, label: `${role.name} · ${role.id}` })),
  ], [discordData?.roles])
  const groupOptions = useMemo<SelectOption[]>(() => [{ value: '', label: 'Keine Unitgruppe (eigenständig)' }, ...(localGroups ?? []).map((group) => ({ value: group.id, label: group.name }))], [localGroups])
  const orphanedUnits = useMemo(() => groups ? (units ?? []).filter(unit => hasMissingUnitGroup(unit, groups)) : [], [units, groups])
  const ungroupedUnits = useMemo(() => (units ?? []).filter(unit => !unit.groupId || (groups !== null && hasMissingUnitGroup(unit, groups))), [units, groups])
  const visibleUngroupedUnits = ungroupedUnits.filter(unit => matchesSearch(query, [unit.name, unit.key, unit.description]))
  const visibleGroups = useMemo(() => {
    return (localGroups ?? []).filter(group => matchesSearch(query, [group.name, group.key, group.description, ...group.units.flatMap(unit => [unit.name, unit.key])]))
  }, [localGroups, query])

  const refreshAll = async () => { await Promise.all([refetchUnits(), refetchGroups()]) }
  const toggleGroupModule = (key: UnitModuleKey) => setGroupForm((current) => { const modules = { ...current.modules }; if (modules[key]) delete modules[key]; else modules[key] = 'view'; return { ...current, modules } })
  const setGroupModuleAccess = (key: UnitModuleKey, access: UnitModuleAccess) => setGroupForm((current) => ({ ...current, modules: { ...current.modules, [key]: access } }))
  const togglePermission = (permission: Permission, checked: boolean) => setGroupForm((current) => ({ ...current, permissions: checked ? Array.from(new Set([...current.permissions, permission])) : current.permissions.filter((item) => item !== permission) }))

  const openCreateGroup = () => {
    setEditingGroup(null)
    setGroupForm(emptyGroupForm(Math.max(0, ...(localGroups ?? []).map((group) => group.sortOrder)) + 10))
    setGroupStep(0)
    setGroupModalOpen(true)
  }
  const openEditGroup = (group: UnitGroup) => {
    setEditingGroup(group)
    setGroupForm({ name: group.name, description: group.description ?? '', color: group.color, icon: sanitizeUnitIcon(group.icon), sortOrder: group.sortOrder, active: group.active, showInNavigation: group.showInNavigation, modules: sanitizeUnitModules(group.modules), permissions: (group.permissions ?? []).filter((permission) => !MODULE_PERMISSIONS.has(permission)), memberDiscordRoleId: group.memberDiscordRoleId ?? '', leadershipDiscordRoleId: group.leadershipDiscordRoleId ?? '' })
    setGroupStep(0)
    setGroupModalOpen(true)
  }
  const openCreateUnit = (groupId = '') => {
    setEditingUnit(null)
    const siblings = groupId ? (localGroups ?? []).find((group) => group.id === groupId)?.units ?? [] : ungroupedUnits
    setUnitForm(emptyUnitForm(groupId, Math.max(0, ...siblings.map((unit) => unit.sortOrder)) + 10))
    setUnitModalOpen(true)
  }
  const openEditUnit = (unit: Unit) => {
    setEditingUnit(unit)
    const missingGroup = groups ? hasMissingUnitGroup(unit, groups) : false
    setUnitForm({ name: unit.name, description: unit.description ?? '', color: unit.color, icon: sanitizeUnitIcon(unit.icon), sortOrder: unit.sortOrder, active: unit.active, groupId: missingGroup ? '' : unit.groupId ?? '', isLeadership: missingGroup ? false : unit.isLeadership, discordRoleId: unit.discordRoleId ?? '' })
    setUnitModalOpen(true)
  }
  const goToGroupStep = (step: number) => {
    if (step > 0 && !groupForm.name.trim()) { addToast({ type: 'error', title: 'Name fehlt', message: 'Gib der Unitgruppe zuerst einen eindeutigen Namen.' }); return }
    setGroupStep(Math.max(0, Math.min(step, GROUP_STEPS.length - 1)))
  }
  const saveGroup = async () => {
    const payload = { name: groupForm.name.trim(), description: groupForm.description.trim(), color: groupForm.color, icon: groupForm.icon, sortOrder: groupForm.sortOrder, active: groupForm.active, showInNavigation: groupForm.showInNavigation && selectedModuleEntries(groupForm.modules).length > 0, modules: groupForm.modules, permissions: groupForm.permissions, memberDiscordRoleId: groupForm.memberDiscordRoleId, leadershipDiscordRoleId: groupForm.leadershipDiscordRoleId }
    try { await execute(editingGroup ? `/api/unit-groups/${editingGroup.id}` : '/api/unit-groups', { method: editingGroup ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); addToast({ type: 'success', title: editingGroup ? 'Unitgruppe gespeichert' : 'Unitgruppe erstellt', message: 'Füge jetzt die Unterränge hinzu und markiere die Leitung.' }); setGroupModalOpen(false); await refreshAll() } catch (error) { addToast({ type: 'error', title: 'Unitgruppe konnte nicht gespeichert werden', message: error instanceof Error ? error.message : '' }) }
  }
  const saveUnit = async () => {
    const payload = { name: unitForm.name.trim(), description: unitForm.description.trim(), color: unitForm.color, icon: unitForm.icon, sortOrder: unitForm.sortOrder, active: unitForm.active, groupId: unitForm.groupId || null, isLeadership: unitForm.isLeadership, discordRoleId: unitForm.discordRoleId || null, showInNavigation: unitForm.groupId ? false : editingUnit?.showInNavigation ?? false }
    try { await execute(editingUnit ? `/api/units/${editingUnit.id}` : '/api/units', { method: editingUnit ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); addToast({ type: 'success', title: editingUnit ? 'Unterrang gespeichert' : 'Unterrang hinzugefügt', message: unitForm.isLeadership ? 'Die Leitungsrolle wird beim nächsten Discord-Sync berücksichtigt.' : '' }); setUnitModalOpen(false); await refreshAll() } catch (error) { addToast({ type: 'error', title: 'Unterrang konnte nicht gespeichert werden', message: error instanceof Error ? error.message : '' }) }
  }
  const handleReorderUnits = async (groupId: string, reorderedUnits: Unit[]) => {
    setLocalGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, units: reorderedUnits } : g)))
    try {
      await execute('/api/units/reorder', {
        method: 'POST',
        body: JSON.stringify({
          unitIds: reorderedUnits.map((u) => u.id),
        }),
      })
      addToast({
        type: 'success',
        title: 'Reihenfolge gespeichert',
        message: 'Die Unterränge wurden erfolgreich neu angeordnet.',
      })
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Sortierung fehlgeschlagen',
        message: err instanceof Error ? err.message : 'Fehler beim Speichern',
      })
      await refetchGroups()
    }
  }
  const promoteUnitToGroup = async (unit: Unit) => {
    if (!window.confirm(`„${unit.name}“ als neue Unitgruppe übernehmen? Die bestehende Unit bleibt als erste Unterunit erhalten.`)) return
    try {
      await execute(`/api/unit-groups/from-unit/${unit.id}`, { method: 'POST', body: JSON.stringify({}) })
      addToast({ type: 'success', title: 'Unitgruppe erstellt', message: `${unit.name} ist jetzt die erste Unterunit der neuen Gruppe.` })
      await refreshAll()
    } catch (error) {
      addToast({ type: 'error', title: 'Unitgruppe konnte nicht erstellt werden', message: error instanceof Error ? error.message : '' })
    }
  }
  const deleteGroup = async () => {
    if (!editingGroup || !window.confirm(`Unitgruppe „${editingGroup.name}“ wirklich löschen? Verschiebe zuerst alle Unterränge.`)) return
    try { await execute(`/api/unit-groups/${editingGroup.id}`, { method: 'DELETE' }); addToast({ type: 'success', title: 'Unitgruppe gelöscht' }); setGroupModalOpen(false); await refreshAll() } catch (error) { addToast({ type: 'error', title: 'Unitgruppe konnte nicht gelöscht werden', message: error instanceof Error ? error.message : '' }) }
  }
  const deleteUnit = async () => {
    if (!editingUnit || !window.confirm(`Unterrang „${editingUnit.name}“ wirklich löschen?`)) return
    try { await execute(`/api/units/${editingUnit.id}`, { method: 'DELETE' }); addToast({ type: 'success', title: 'Unterrang gelöscht' }); setUnitModalOpen(false); await refreshAll() } catch (error) { addToast({ type: 'error', title: 'Unterrang konnte nicht gelöscht werden', message: error instanceof Error ? error.message : '' }) }
  }

  if (unitsLoading || groupsLoading) return <PageLoader />
  const loadError = unitsError || groupsError

  return (
    <div className="lspd-units mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Organisation"
        title="Units verwalten"
        description="Bündle Ränge zu übersichtlichen Unitgruppen. Die Gruppe steuert Arbeitsbereiche und Navigation; Unterränge steuern die Besetzung und Leitung."
        action={
          <Button size="sm" onClick={openCreateGroup} disabled={Boolean(loadError)}>
            <Plus size={14} strokeWidth={2.2} /> Unitgruppe erstellen
          </Button>
        }
      />
      <details className="lspd-card mb-5 px-5 py-4">
        <summary className="cursor-pointer text-[13px] font-medium text-label-2">Wie funktionieren Gruppen, Units und Leitung?</summary>
        <div className="mt-4"><UnitFlowExplanation /></div>
      </details>
      {orphanedUnits.length > 0 && <div role="status" className="mb-5 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-4 text-[13px] leading-6 text-gold-bright">
        <strong>{orphanedUnits.length} Units ohne gültige Gruppe gefunden.</strong> Die frühere Gruppe existiert nicht mehr. Diese Units bleiben unter <a href="#einzelne-units" className="underline underline-offset-4">Einzelne Units</a> sichtbar. Über „Bearbeiten“ kannst du sie einer vorhandenen Gruppe zuordnen. Officer- und Benutzerzuweisungen bleiben erhalten.
      </div>}

      <div className="lspd-card mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
        <label className="relative block max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-4" size={14} />
          <span className="sr-only">Units und Gruppen durchsuchen</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Unit, Gruppe oder Schlüssel suchen"
            className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-[13px] text-label outline-none transition-colors placeholder:text-label-2 focus:border-gold"
          />
        </label>
        <p className="text-[12px] text-label-2">{units?.length ?? 0} Units in {localGroups.length} Gruppen</p>
      </div>
      {loadError && (
        <div className="mb-4 rounded-[12px] border border-red/15 bg-red/[0.06] px-4 py-3 text-[11.5px] text-red">
          Unitgruppen konnten nicht geladen werden: {loadError}
          <button type="button" onClick={() => void refreshAll()} className="ml-3 underline underline-offset-4">Erneut laden</button>
        </div>
      )}

      <div className="space-y-4">
        {visibleGroups.map((group, index) => {
          const expanded = Boolean(query.trim()) || expandedGroup === group.id
          const leadershipCount = group.units.filter((unit) => unit.isLeadership).length
          const counts = group.assignmentCounts ?? { officers: 0, directUsers: 0 }
          return (
            <motion.section
              key={group.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(index * 0.03, 0.18) }}
              className="relative overflow-hidden rounded-[16px] border border-line bg-surface"
            >
              <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: group.color }} />
              <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(230px,0.9fr)_minmax(290px,1.4fr)_minmax(260px,0.9fr)] lg:items-center lg:px-6">
                <div className="flex min-w-0 items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => setExpandedGroup(expanded ? null : group.id)}
                    aria-expanded={expanded}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border bg-surface-2 transition-colors hover:bg-surface-3"
                    style={{ color: group.color, borderColor: `${group.color}45` }}
                  >
                    <ChevronRight size={19} className={cn('transition-transform', expanded && 'rotate-90')} />
                  </button>
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border bg-surface-2"
                    style={{ color: group.color, borderColor: `${group.color}40` }}
                  >
                    <UnitIcon icon={group.icon} size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[14px] font-semibold text-label">{group.name}</h2>
                      <span
                        className={cn(
                          'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                          group.active ? 'bg-green/[0.08] text-green' : 'bg-white/[0.03] text-label-3',
                        )}
                      >
                        {group.active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-label-4">{group.key}</p>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-label-3">
                      {group.description || 'Keine Beschreibung hinterlegt'}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 lg:border-l lg:border-line lg:pl-5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold text-label-3">Gemeinsame Arbeitsbereiche</p>
                    {group.showInNavigation && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green">
                        <Navigation size={10} /> Sidebar
                      </span>
                    )}
                  </div>
                  <ModuleChips modules={sanitizeUnitModules(group.modules)} color={group.color} />
                </div>
                <div className="flex flex-col gap-3 lg:border-l lg:border-line lg:pl-5">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-[10px] bg-surface px-2.5 py-2.5">
                      <span className="flex items-center gap-1 text-[11px] font-semibold font-semibold text-label-3">
                        <Layers3 size={10} /> Ränge
                      </span>
                      <span className="mt-1 block text-[14px] font-semibold text-label">{group.units.length}</span>
                    </div>
                    <div className="rounded-[10px] bg-surface px-2.5 py-2.5">
                      <span className="flex items-center gap-1 text-[11px] font-semibold font-semibold text-label-3">
                        <ShieldCheck size={10} /> Leitung
                      </span>
                      <span className="mt-1 block text-[14px] font-semibold text-label">{leadershipCount}</span>
                    </div>
                    <div className="rounded-[10px] bg-surface px-2.5 py-2.5">
                      <span className="flex items-center gap-1 text-[11px] font-semibold font-semibold text-label-3">
                        <Users size={10} /> Officers
                      </span>
                      <span className="mt-1 block text-[14px] font-semibold text-label">{counts.officers}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => openCreateUnit(group.id)}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-gold/10 px-2.5 text-[11px] font-semibold text-gold transition-colors hover:bg-gold/16"
                    >
                      <Plus size={12} /> Rang hinzufügen
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditGroup(group)}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-line px-2.5 text-[11px] font-semibold text-label-2 transition-colors hover:border-gold/35 hover:text-gold-bright"
                    >
                      <Edit3 size={12} /> Bearbeiten
                    </button>
                  </div>
                </div>
              </div>
              {expanded && (
                <div className="border-t border-line bg-white/[0.03] px-5 py-4 lg:px-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold text-label-3">Unterränge dieser Gruppe</p>
                      <p className="mt-1 text-[11px] text-label-4">
                        Verschiebe Ränge am Griff, um die Reihenfolge direkt festzulegen. Markiere Leitungsränge für automatische Rollen.
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => openCreateUnit(group.id)}>
                      <Plus size={12} /> Unterrang
                    </Button>
                  </div>
                  {group.units.length > 0 ? (
                    <Reorder.Group
                      axis="y"
                      values={group.units}
                      onReorder={(newUnits) => void handleReorderUnits(group.id, newUnits)}
                      className="space-y-2"
                    >
                      {group.units.map((unit) => (
                        <SubRankReorderItem
                          key={unit.id}
                          unit={unit}
                          onEdit={() => openEditUnit(unit)}
                        />
                      ))}
                    </Reorder.Group>
                  ) : (
                    <div className="rounded-[11px] border border-dashed border-line px-4 py-8 text-center text-[11px] text-label-3">
                      Noch keine Unterränge. Füge den ersten Rang hinzu.
                    </div>
                  )}
                </div>
              )}
            </motion.section>
          )
        })}

        <section id="einzelne-units" className="scroll-mt-20 overflow-hidden rounded-[16px] border border-line-strong bg-white/[0.03]">
          <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-bold text-label-3">Einzelne Units</p>
              <p className="mt-1 text-[11px] text-label-4">
                Diese Units sind noch keiner Gruppe zugeordnet. Bearbeite sie, verschiebe sie in eine bestehende Gruppe oder übernimm sie direkt als neue Gruppe.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => openCreateUnit()}>
              <Plus size={12} /> Einzelne Unit
            </Button>
          </div>
          <div className="divide-y divide-line">
            {visibleUngroupedUnits.map((unit) => {
                const counts = unit.assignmentCounts ?? { officers: 0, directUsers: 0 }
                return (
                  <div key={unit.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border bg-surface-2"
                      style={{ color: unit.color, borderColor: `${unit.color}40` }}
                    >
                      <UnitIcon icon={unit.icon} size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[11.5px] font-semibold text-label">{unit.name}</span>
                        {groups && hasMissingUnitGroup(unit, groups) && <span className="rounded-md bg-amber-300/10 px-2 py-0.5 text-[11px] text-gold-bright">Gruppe fehlt</span>}
                        {!unit.active && <span className="text-[11px] text-label-2">Inaktiv</span>}
                        <span className="font-mono text-[11px] text-label-4">{unit.key}</span>
                      </div>
                      <span className="mt-1 block text-[11px] text-label-3">
                        {counts.officers} Officers · {counts.directUsers} direkte Benutzer
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => void promoteUnitToGroup(unit)}
                        disabled={saving || Boolean(unit.groupId)}
                        title={unit.groupId ? 'Zuerst über Bearbeiten die fehlende Gruppenzuordnung auflösen.' : undefined}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-gold/30 bg-gold/[0.06] px-2.5 text-[11px] font-semibold text-gold transition-colors hover:border-gold/60 hover:bg-gold/[0.12] disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Layers3 size={12} /> Als Gruppe nutzen
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditUnit(unit)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-line px-2.5 text-[11px] font-semibold text-label-2 hover:border-gold/35 hover:text-gold-bright"
                      >
                        <Edit3 size={12} /> Bearbeiten
                      </button>
                    </div>
                  </div>
                )
              })}
            {visibleUngroupedUnits.length === 0 && (
              <div className="px-5 py-8 text-center text-[11px] text-label-3">
                {query ? 'Keine einzelnen Units für diese Suche gefunden.' : 'Alle Units sind bereits in einer Gruppe organisiert.'}
              </div>
            )}
          </div>
        </section>

        {!loadError && visibleGroups.length === 0 && visibleUngroupedUnits.length === 0 && (
          <div className="rounded-[16px] border border-dashed border-line py-16 text-center">
            <Layers3 size={28} className="mx-auto mb-3 text-label-4" strokeWidth={1.5} />
            <p className="text-[13px] font-medium text-label-2">{query ? 'Keine passenden Units oder Gruppen gefunden.' : 'Noch keine Unitgruppen vorhanden'}</p>
            {query ? <Button className="mt-4" size="sm" variant="secondary" onClick={() => setQuery('')}>Suche zurücksetzen</Button> : <Button className="mt-4" size="sm" onClick={openCreateGroup}><Plus size={13} /> Erste Unitgruppe erstellen</Button>}
          </div>
        )}
      </div>

      <Modal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        title={editingGroup ? 'Unitgruppe bearbeiten' : 'Neue Unitgruppe erstellen'}
        description={`${groupStep + 1} von ${GROUP_STEPS.length} · ${GROUP_STEPS[groupStep].description}`}
        size="xl"
      >
        <nav className="mb-6 grid grid-cols-3 gap-1.5 rounded-[12px] border border-line bg-surface p-1.5" aria-label="Unitgruppen-Einrichtung">
          {GROUP_STEPS.map((step, index) => {
            const active = groupStep === index
            const complete = groupStep > index
            return (
              <button
                type="button"
                key={step.label}
                onClick={() => goToGroupStep(index)}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-[9px] px-2.5 py-2 text-left transition-colors sm:px-3',
                  active ? 'bg-surface-2 text-label' : 'text-label-3 hover:bg-surface hover:text-label-2',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
                    active && 'border-gold/60 bg-gold/12 text-gold',
                    complete && 'border-green/27 bg-green/10 text-green',
                    !active && !complete && 'border-line text-label-3',
                  )}
                >
                  {complete ? <Check size={11} strokeWidth={2.7} /> : index + 1}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-[11px] font-semibold">{step.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-semibold opacity-60">{step.description}</span>
                </span>
              </button>
            )
          })}
        </nav>
        <div className="min-h-[420px]">
          {groupStep === 0 && (
            <section>
              <p className="text-[11px] font-bold text-gold/75">Schritt 1 · Identität</p>
              <h3 className="mt-1.5 text-[16px] font-semibold text-label">Wie heißt diese Unitgruppe?</h3>
              <p className="mt-1 text-[11px] leading-5 text-label-3">
                Die Gruppe ist die sichtbare Klammer. Darunter legst du später Ränge wie Leitung, Senior oder Officer an.
              </p>
              <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_220px]">
                <div className="space-y-4">
                  <Input
                    label="Name der Unitgruppe"
                    value={groupForm.name}
                    onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })}
                    placeholder="z. B. Internal Affairs"
                    required
                    autoFocus
                  />
                  <div>
                    <label htmlFor="group-description" className="mb-1.5 block text-[12.5px] font-medium text-label-2">
                      Aufgabe der Gruppe
                    </label>
                    <textarea
                      id="group-description"
                      value={groupForm.description}
                      onChange={(event) => setGroupForm({ ...groupForm, description: event.target.value })}
                      rows={4}
                      placeholder="Wofür ist diese Unit zuständig?"
                      className="w-full resize-none rounded-[9px] border border-line bg-surface px-3 py-2.5 text-[13px] leading-5 text-label outline-none transition-all placeholder:text-label-4 focus:border-gold"
                    />
                  </div>
                </div>
                <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
                  <div className="h-1.5" style={{ backgroundColor: groupForm.color }} />
                  <div className="flex min-h-[154px] flex-col items-center justify-center p-5 text-center">
                    <span
                      className="flex h-14 w-14 items-center justify-center rounded-[16px] border bg-surface-2"
                      style={{ color: groupForm.color, borderColor: `${groupForm.color}45` }}
                    >
                      <UnitIcon icon={groupForm.icon} size={24} />
                    </span>
                    <p className="mt-3 max-w-full truncate text-[13px] font-semibold text-label">
                      {groupForm.name.trim() || 'Name der Unitgruppe'}
                    </p>
                    <p className="mt-1 text-[11px] text-label-3">Vorschau</p>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr]">
                <ColorField value={groupForm.color} onChange={(color) => setGroupForm({ ...groupForm, color })} />
                <div>
                  <p className="mb-2 block text-[12.5px] font-medium text-label-2">Icon</p>
                  <div className="grid grid-cols-10 gap-1.5 rounded-xl border border-line bg-surface p-2 max-sm:grid-cols-5">
                    {UNIT_ICON_OPTIONS.map((option) => (
                      <button
                        type="button"
                        key={option.key}
                        onClick={() => setGroupForm({ ...groupForm, icon: option.key })}
                        aria-label={option.label}
                        aria-pressed={groupForm.icon === option.key}
                        title={option.label}
                        className={cn(
                          'flex aspect-square items-center justify-center rounded-lg border transition-all',
                          groupForm.icon === option.key
                            ? 'border-gold/55 bg-gold/12 text-gold'
                            : 'border-transparent text-label-3 hover:border-line hover:bg-surface-2',
                        )}
                      >
                        <UnitIcon icon={option.key} size={15} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
          {groupStep === 1 && (
            <section>
              <p className="text-[11px] font-bold text-cyan/80">Schritt 2 · Arbeitsbereiche</p>
              <h3 className="mt-1.5 text-[16px] font-semibold text-label">Was darf die ganze Gruppe?</h3>
              <p className="mt-1 text-[11px] leading-5 text-label-3">
                Diese Auswahl gilt automatisch für jeden Unterrang der Gruppe. Einzelne Ränge müssen nicht mehr separat konfiguriert werden.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-[11px] border border-cyan/9 bg-cyan/[0.045] px-3 py-2.5">
                  <Eye size={14} className="text-cyan" />
                  <span>
                    <span className="block text-[11px] font-semibold text-cyan">Nur ansehen</span>
                    <span className="text-[11px] text-label-3">Öffnen, aber nicht verändern</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-[11px] border border-gold/15 bg-gold/[0.045] px-3 py-2.5">
                  <Settings2 size={14} className="text-gold" />
                  <span>
                    <span className="block text-[11px] font-semibold text-gold">Bearbeiten</span>
                    <span className="text-[11px] text-label-3">Erstellen und verwalten</span>
                  </span>
                </div>
              </div>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {UNIT_MODULES.map((module) => {
                  const access = groupForm.modules[module.key]
                  const selected = Boolean(access)
                  return (
                    <div
                      key={module.key}
                      className={cn(
                        'rounded-[12px] border p-3.5',
                        selected
                          ? 'border-gold/28 bg-gold/[0.045]'
                          : 'border-line bg-white/[0.03] hover:border-line-strong',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroupModule(module.key)}
                        className="flex w-full items-start gap-3 text-left"
                      >
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border',
                            selected
                              ? 'border-gold/30 bg-gold/10 text-gold'
                              : 'border-line bg-surface-2 text-label-3',
                          )}
                        >
                          <UnitIcon icon={module.icon} size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-[12px] font-semibold', selected ? 'text-label' : 'text-label-2')}>
                            {module.label}
                          </span>
                          <span className="mt-1 block text-[11px] leading-4 text-label-3">{module.description}</span>
                        </span>
                        <span
                          className={cn(
                            'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border',
                            selected ? 'border-gold bg-gold text-ink' : 'border-line',
                          )}
                        >
                          {selected && <Check size={11} strokeWidth={3} />}
                        </span>
                      </button>
                      {selected && (
                        <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-gold/10 pt-2.5">
                          <button
                            type="button"
                            onClick={() => setGroupModuleAccess(module.key, 'view')}
                            className={cn(
                              'inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] text-[11px] font-semibold',
                              access === 'view' ? 'bg-cyan/12 text-cyan' : 'text-label-3 hover:bg-surface-2',
                            )}
                          >
                            <Eye size={11} /> Ansehen
                          </button>
                          <button
                            type="button"
                            onClick={() => setGroupModuleAccess(module.key, 'manage')}
                            className={cn(
                              'inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] text-[11px] font-semibold',
                              access === 'manage' ? 'bg-gold/14 text-gold' : 'text-label-3 hover:bg-surface-2',
                            )}
                          >
                            <Settings2 size={11} /> Bearbeiten
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          {groupStep === 2 && (
            <section>
              <p className="text-[11px] font-bold text-green/80">Schritt 3 · Rollen & Start</p>
              <h3 className="mt-1.5 text-[16px] font-semibold text-label">Wann und wie wird die Gruppe sichtbar?</h3>
              <p className="mt-1 text-[11px] leading-5 text-label-3">
                Die beiden Discord-Rollen werden für alle Unterränge beziehungsweise nur für markierte Leitungsränge synchronisiert.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <ToggleSetting
                  checked={groupForm.active}
                  title="Unitgruppe aktiv"
                  description="Unterränge können zugewiesen werden und die Gruppenrechte gelten."
                  onChange={(active) => setGroupForm({ ...groupForm, active })}
                />
                <ToggleSetting
                  checked={groupForm.showInNavigation && selectedModuleEntries(groupForm.modules).length > 0}
                  disabled={selectedModuleEntries(groupForm.modules).length === 0}
                  title="Eigene Navigation anzeigen"
                  description={
                    selectedModuleEntries(groupForm.modules).length > 0
                      ? 'Die Gruppe erscheint als gemeinsamer Bereich in der Sidebar.'
                      : 'Erfordert mindestens einen Arbeitsbereich.'
                  }
                  onChange={(showInNavigation) => setGroupForm({ ...groupForm, showInNavigation })}
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Select
                  label="Discord-Rolle für alle Mitglieder"
                  value={groupForm.memberDiscordRoleId}
                  onValueChange={(memberDiscordRoleId) => setGroupForm({ ...groupForm, memberDiscordRoleId })}
                  options={roles}
                  placeholder="Keine gemeinsame Rolle"
                  size="sm"
                />
                <Select
                  label="Discord-Leitungsrolle"
                  value={groupForm.leadershipDiscordRoleId}
                  onValueChange={(leadershipDiscordRoleId) => setGroupForm({ ...groupForm, leadershipDiscordRoleId })}
                  options={roles}
                  placeholder="Keine Leitungsrolle"
                  size="sm"
                />
              </div>
              <details className="group mt-4 rounded-[12px] border border-line bg-white/[0.03] p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[11.5px] font-semibold text-label-2">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal size={14} className="text-label-3" /> Erweiterte Einzelrechte
                  </span>
                  <span className="flex items-center gap-2 text-[11px] font-normal text-label-4">
                    {groupForm.permissions.length} ausgewählt <ChevronRight size={13} className="transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <p className="mb-3 mt-3 text-[11px] leading-5 text-label-4">
                  Nur für Sonderfälle. Rechte der Arbeitsbereiche werden automatisch vergeben.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[11px] font-bold text-label-3">Ansehen</p>
                    <div className="max-h-48 space-y-1.5 overflow-auto pr-1">
                      {EXTRA_READ_PERMISSIONS.map((permission) => (
                        <Checkbox
                          key={permission}
                          checked={groupForm.permissions.includes(permission)}
                          onCheckedChange={(checked) => togglePermission(permission, checked)}
                          label={PERMISSION_LABELS[permission]}
                          className="rounded-lg border border-line bg-white/[0.03] px-3 py-2"
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] font-bold text-label-3">Bearbeiten</p>
                    <div className="max-h-48 space-y-1.5 overflow-auto pr-1">
                      {EXTRA_MANAGE_PERMISSIONS.map((permission) => (
                        <Checkbox
                          key={permission}
                          checked={groupForm.permissions.includes(permission)}
                          onCheckedChange={(checked) => togglePermission(permission, checked)}
                          label={PERMISSION_LABELS[permission]}
                          className="rounded-lg border border-line bg-white/[0.03] px-3 py-2"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </details>
              {editingGroup && (
                <div className="mt-4 rounded-[12px] border border-red/12 bg-red/[0.04] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11.5px] font-semibold text-red">Gefahrenbereich</p>
                      <p className="mt-1 text-[11px] leading-4 text-label-3">
                        Gruppe kann nur gelöscht werden, wenn keine Unterränge mehr zugeordnet sind.
                      </p>
                    </div>
                    <Button type="button" variant="danger" size="sm" onClick={() => void deleteGroup()} disabled={saving}>
                      <Trash2 size={12} /> Unitgruppe löschen
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
        <div className="sticky -bottom-6 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4 backdrop-blur-xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (groupStep === 0 ? setGroupModalOpen(false) : goToGroupStep(groupStep - 1))}
          >
            <ArrowLeft size={13} /> {groupStep === 0 ? 'Abbrechen' : 'Zurück'}
          </Button>
          <div className="hidden min-w-0 items-center gap-2 text-[11px] text-label-3 sm:flex">
            <UnitIcon icon={groupForm.icon} size={13} style={{ color: groupForm.color }} />
            <span className="truncate">
              {groupForm.name.trim() || 'Neue Unitgruppe'} · {selectedModuleEntries(groupForm.modules).length} Bereiche
            </span>
          </div>
          {groupStep < GROUP_STEPS.length - 1 ? (
            <Button size="sm" onClick={() => goToGroupStep(groupStep + 1)} disabled={!groupForm.name.trim()}>
              Weiter <ArrowRight size={13} />
            </Button>
          ) : (
            <Button size="sm" onClick={() => void saveGroup()} disabled={!groupForm.name.trim() || saving}>
              {saving ? 'Speichert …' : editingGroup ? 'Änderungen speichern' : 'Unitgruppe erstellen'} <Check size={13} />
            </Button>
          )}
        </div>
      </Modal>

      <Modal
        open={unitModalOpen}
        onClose={() => setUnitModalOpen(false)}
        title={editingUnit ? 'Unit bearbeiten' : 'Unit hinzufügen'}
        description="Rang, Gruppenzugehörigkeit und automatische Discord-Rollen festlegen."
        size="lg"
      >
        <div className="space-y-5">
          {editingUnit && groups && hasMissingUnitGroup(editingUnit, groups) && <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-4 text-[13px] leading-6 text-gold-bright">Die bisherige Gruppe existiert nicht mehr. Wähle eine neue Gruppe oder speichere diese Unit als eigenständige Unit. Ihre bestehenden Zuweisungen bleiben erhalten.</div>}
          <div>
            <p className="text-[11px] font-bold text-gold/75">Unitrang</p>
            <h3 className="mt-1.5 text-[16px] font-semibold text-label">Welche Rolle hat dieser Unterrang?</h3>
            <p className="mt-1 text-[11px] leading-5 text-label-3">
              Ein Unterrang ist die konkrete Zuordnung eines Officers innerhalb einer Unitgruppe. Markiere alle Ränge, die zur Leitung gehören.
            </p>
          </div>
          <div>
            <Input
              label="Name des Unterrangs"
              value={unitForm.name}
              onChange={(event) => setUnitForm({ ...unitForm, name: event.target.value })}
              placeholder="z. B. IA Leitung"
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="unit-description" className="mb-1.5 block text-[12.5px] font-medium text-label-2">
              Beschreibung
            </label>
            <textarea
              id="unit-description"
              value={unitForm.description}
              onChange={(event) => setUnitForm({ ...unitForm, description: event.target.value })}
              rows={3}
              placeholder="Wofür steht dieser Rang?"
              className="w-full resize-none rounded-[9px] border border-line bg-surface px-3 py-2.5 text-[13px] leading-5 text-label outline-none transition-all placeholder:text-label-4 focus:border-gold"
            />
          </div>
          <Select
            label="Unitgruppe"
            value={unitForm.groupId}
            onValueChange={(groupId) => setUnitForm({ ...unitForm, groupId, isLeadership: groupId ? unitForm.isLeadership : false })}
            options={groupOptions}
            placeholder="Unitgruppe auswählen"
          />
          <Select
            label="Discord-Rolle für diesen Unterrang"
            value={unitForm.discordRoleId}
            onValueChange={(discordRoleId) => setUnitForm({ ...unitForm, discordRoleId })}
            options={roles}
            placeholder="Keine individuelle Rolle"
            size="sm"
          />
          <ToggleSetting
            checked={unitForm.isLeadership}
            disabled={!unitForm.groupId}
            title="Als Unit-Leitung markieren"
            description={
              unitForm.groupId
                ? 'Alle Officers mit diesem Rang erhalten die Leitungsrolle der Gruppe und dürfen die Gruppen-Units verwalten.'
                : 'Eine Leitung kann nur innerhalb einer Unitgruppe markiert werden.'
            }
            onChange={(isLeadership) => setUnitForm({ ...unitForm, isLeadership })}
          />
          <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
            <ColorField label="Rangfarbe" value={unitForm.color} onChange={(color) => setUnitForm({ ...unitForm, color })} />
            <div>
              <p className="mb-2 block text-[12.5px] font-medium text-label-2">Icon</p>
              <div className="grid grid-cols-10 gap-1.5 rounded-xl border border-line bg-surface p-2 max-sm:grid-cols-5">
                {UNIT_ICON_OPTIONS.slice(0, 15).map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    onClick={() => setUnitForm({ ...unitForm, icon: option.key })}
                    aria-label={option.label}
                    className={cn(
                      'flex aspect-square items-center justify-center rounded-lg border transition-all',
                      unitForm.icon === option.key
                        ? 'border-gold/55 bg-gold/12 text-gold'
                        : 'border-transparent text-label-3 hover:border-line hover:bg-surface-2',
                    )}
                  >
                    <UnitIcon icon={option.key} size={15} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <ToggleSetting
            checked={unitForm.active}
            title="Unterrang aktiv"
            description="Inaktive Ränge können nicht für neue Zuordnungen verwendet werden."
            onChange={(active) => setUnitForm({ ...unitForm, active })}
          />
          {editingUnit && (
            <div className="rounded-[12px] border border-red/12 bg-red/[0.04] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11.5px] font-semibold text-red">Gefahrenbereich</p>
                  <p className="mt-1 text-[11px] leading-4 text-label-3">Zuweisungen müssen vor dem Löschen entfernt werden.</p>
                </div>
                <Button type="button" variant="danger" size="sm" onClick={() => void deleteUnit()} disabled={saving}>
                  <Trash2 size={12} /> Unterrang löschen
                </Button>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" size="sm" onClick={() => setUnitModalOpen(false)}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={() => void saveUnit()} disabled={!unitForm.name.trim() || saving}>
              {saving ? 'Speichert …' : 'Unterrang speichern'} <Check size={13} />
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
