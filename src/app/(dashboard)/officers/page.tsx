'use client'

import { useState, useMemo, useCallback, type ReactNode, type CSSProperties } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import * as Popover from '@radix-ui/react-popover'
import {
  DndContext,
  type DragEndEvent,
  type CollisionDetection,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  rectIntersection,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Search, Plus, ChevronDown, Users, Check, StickyNote, GripVertical, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useAuth } from '@/context/auth-context'
import {
  cn,
  formatDate,
  getStatusLabel,
  getStatusDot,
  getUnitLabel,
  getUnitBadgeClass,
  getFlagLabel,
  getFlagColor,
  getFlagRowClass,
  compareBadgeNumbers,
} from '@/lib/utils'
import { OFFICER_FLAG_VALUES } from '@/lib/validations/officer'
import { hasPermission } from '@/lib/permissions'
import { officerUnitKeys } from '@/lib/officer-units'

interface Training {
  id: string
  key: string
  label: string
  sortOrder: number
}

interface OfficerTraining {
  id: string
  trainingId: string
  completed: boolean
  training: Training
}

interface Rank {
  id: string
  name: string
  sortOrder: number
  color: string
  badgeMin: number | null
  badgeMax: number | null
}

interface Unit {
  id: string
  key: string
  name: string
  color: string
  sortOrder: number
  active: boolean
}

interface Officer {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  rank: Rank
  rankId: string
  status: string
  unit: string | null
  units: string[] | null
  flag: string | null
  notes: string | null
  hireDate: string
  lastOnline: string | null
  discordId: string | null
  trainings: OfficerTraining[]
}

function UnitBadges({ officer, unitsByKey }: { officer: Pick<Officer, 'unit' | 'units'>; unitsByKey: Map<string, Unit> }) {
  const keys = officerUnitKeys(officer)
  if (keys.length === 0) return <span className="text-[11px] text-[#4a6585]">—</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {keys.map((unitKey) => {
        const unitInfo = unitsByKey.get(unitKey)
        return (
          <span
            key={unitKey}
            className={cn(
              'inline-flex min-w-0 max-w-full items-center px-2 py-[3px] rounded-full text-[10.5px] font-medium border',
              unitInfo ? 'bg-[#0f2340]/70' : getUnitBadgeClass(unitKey)
            )}
            style={unitInfo ? { borderColor: `${unitInfo.color}66`, color: unitInfo.color } : undefined}
          >
            <span className="min-w-0 truncate">{unitInfo?.name ?? getUnitLabel(unitKey)}</span>
          </span>
        )
      })}
    </span>
  )
}

const rankDropCollision: CollisionDetection = (args) => {
  const onlyDrop = (list: { id: string | number }[]) =>
    list.filter((c) => String(c.id).startsWith('drop-'))
  const fromPointer = onlyDrop(pointerWithin(args))
  if (fromPointer.length) return fromPointer
  return onlyDrop(rectIntersection(args))
}

function DropRankZone({ rankId, canHighlight, children }: { rankId: string; canHighlight: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${rankId}` })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-[10px] transition-[box-shadow] duration-150',
        canHighlight && isOver && 'ring-1 ring-[#d4af37]/50 ring-inset'
      )}
    >
      {children}
    </div>
  )
}

const FLAG_OPTIONS: Array<{ id: string | null; label: string; color: string }> = [
  { id: null, label: 'Keine', color: 'transparent' },
  { id: 'RED', label: 'Rot', color: '#ef4444' },
  { id: 'ORANGE', label: 'Orange', color: '#f97316' },
  { id: 'YELLOW', label: 'Gelb', color: '#facc15' },
]

function FlagButton({
  value,
  disabled,
  onChange,
  size = 'md',
}: {
  value: string | null
  disabled: boolean
  onChange: (v: string | null) => void
  size?: 'md' | 'lg'
}) {
  const dim = size === 'lg' ? 'h-[24px] w-[24px]' : 'h-[18px] w-[18px]'
  const trigger = (
    <button
      type="button"
      disabled={disabled}
      aria-label={value ? `Markierung: ${getFlagLabel(value)}` : 'Markierung setzen'}
      className={cn(
        'inline-flex items-center justify-center rounded-full border transition-all',
        dim,
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'hover:scale-110',
        value ? 'border-transparent shadow-sm' : 'border-[#4a6585]/60 hover:border-[#d4af37]/60'
      )}
      style={{ backgroundColor: value ? getFlagColor(value) : 'transparent' }}
      onClick={(e) => e.stopPropagation()}
    >
      {!value && <Flag size={size === 'lg' ? 13 : 10} className="text-[#4a6585]" strokeWidth={1.75} />}
    </button>
  )

  if (disabled) return trigger

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-[200] glass-panel-elevated rounded-[10px] p-1.5 border border-[#234568]/90 shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1">
            {FLAG_OPTIONS.map((opt) => {
              const active = (opt.id ?? null) === (value ?? null)
              return (
                <Popover.Close key={String(opt.id)} asChild>
                  <button
                    type="button"
                    onClick={() => onChange(opt.id)}
                    title={opt.label}
                    className={cn(
                      'h-[28px] w-[28px] rounded-full border flex items-center justify-center transition-all',
                      active ? 'ring-2 ring-[#d4af37] ring-offset-1 ring-offset-[#0b1f3a] border-transparent' : 'border-[#234568]/70 hover:border-[#d4af37]/60'
                    )}
                    style={{ backgroundColor: opt.id ? opt.color : 'transparent' }}
                  >
                    {!opt.id && <Flag size={12} className="text-[#8ea4bd]" strokeWidth={1.75} />}
                  </button>
                </Popover.Close>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function DraggableOfficerRow({
  officer,
  canDrag,
  canEdit,
  allTrainings,
  unitsByKey,
  rowIndex,
  onTrainToggle,
  onFlagChange,
}: {
  officer: Officer
  canDrag: boolean
  canEdit: boolean
  allTrainings: Training[]
  unitsByKey: Map<string, Unit>
  rowIndex: number
  onTrainToggle: (id: string, trainingId: string, done: boolean) => void
  onFlagChange: (id: string, flag: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `drag-${officer.id}`,
    disabled: !canDrag,
  })
  const style: CSSProperties | undefined = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        'transition-colors duration-100',
        officer.flag ? getFlagRowClass(officer.flag) : 'hover:bg-[#0f2340]',
        isDragging && 'opacity-40 z-10',
        rowIndex > 0 && 'border-t border-[#18385f]'
      )}
    >
      <td className="px-0 py-0 w-[3px]" aria-hidden>
        {officer.flag && (
          <span
            className="block h-full w-[3px]"
            style={{ backgroundColor: getFlagColor(officer.flag) }}
          />
        )}
      </td>
      <td className="px-1 py-2 w-7 text-center">
        {canDrag ? (
          <button
            type="button"
            className="inline-flex p-1 rounded-md text-[#4a6585] hover:text-[#d4af37] cursor-grab active:cursor-grabbing"
            aria-label="Zum Verschieben ziehen"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} strokeWidth={2} />
          </button>
        ) : (
          <span className="inline-block w-5" />
        )}
      </td>
      <td className="px-2 py-2.5 font-mono text-[12px] text-[#b7c5d8] align-middle">
        {officer.badgeNumber}
      </td>
      <td className="px-3 py-2.5 align-middle min-w-0 max-w-0 overflow-hidden">
        <Link
          href={`/officers/${officer.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block text-[13px] font-medium text-[#eee] hover:text-[#d4af37] transition-colors truncate"
          title={`${officer.firstName} ${officer.lastName}`}
        >
          {officer.firstName} {officer.lastName}
        </Link>
      </td>
      {allTrainings.map((t) => {
        const ot = officer.trainings.find((x) => x.trainingId === t.id)
        const completed = ot?.completed || false
        return (
          <td key={t.id} className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onTrainToggle(officer.id, t.id, !completed)}
              className={cn(
                'mx-auto h-[18px] w-[18px] rounded-[4px] flex items-center justify-center transition-all duration-150',
                completed ? 'bg-[#d4af37]' : 'bg-[#18385f] hover:bg-[#1e3a5f]'
              )}
            >
              {completed && <Check size={11} className="text-[#0b1f3a]" strokeWidth={3} />}
            </button>
          </td>
        )
      })}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <UnitBadges officer={officer} unitsByKey={unitsByKey} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-[6px] w-[6px] rounded-full', getStatusDot(officer.status))} />
          <span className="text-[12px] text-[#8ea4bd]">{getStatusLabel(officer.status)}</span>
        </span>
      </td>
      <td className="px-3 py-2.5 text-[12px] text-[#8ea4bd]">{formatDate(officer.hireDate)}</td>
      <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex items-center gap-1.5">
          <FlagButton
            value={officer.flag}
            disabled={!canEdit}
            onChange={(v) => onFlagChange(officer.id, v)}
          />
          {officer.notes && <StickyNote size={12} className="text-[#4a6585]" strokeWidth={1.75} />}
        </div>
      </td>
    </tr>
  )
}

function MobileOfficerCard({
  officer,
  allTrainings,
  unitsByKey,
  canEdit,
  onTrainToggle,
  onFlagChange,
}: {
  officer: Officer
  allTrainings: Training[]
  unitsByKey: Map<string, Unit>
  canEdit: boolean
  onTrainToggle: (id: string, trainingId: string, done: boolean) => void
  onFlagChange: (id: string, flag: string | null) => void
}) {
  return (
    <div
      className={cn(
        'relative rounded-[10px] border border-[#18385f]/40 px-3.5 py-3 transition-colors',
        officer.flag ? getFlagRowClass(officer.flag) : 'bg-[#0a1a33]/60 hover:bg-[#0f2340]'
      )}
    >
      {officer.flag && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[10px]"
          style={{ backgroundColor: getFlagColor(officer.flag) }}
        />
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <span className="block font-mono text-[11px] text-[#b7c5d8] mb-1">
            {officer.badgeNumber}
          </span>
          <Link
            href={`/officers/${officer.id}`}
            className="block text-[14px] font-semibold text-[#eee] hover:text-[#d4af37] transition-colors truncate"
          >
            {officer.firstName} {officer.lastName}
          </Link>
        </div>
        <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
          <FlagButton
            value={officer.flag}
            disabled={!canEdit}
            onChange={(v) => onFlagChange(officer.id, v)}
            size="lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-2.5">
        <div className="min-w-0">
          {officerUnitKeys(officer).length > 0 ? (
            <UnitBadges officer={officer} unitsByKey={unitsByKey} />
          ) : (
            <span className="text-[11px] text-[#4a6585]">—</span>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 justify-self-end whitespace-nowrap pt-[3px]">
          <span className={cn('h-[6px] w-[6px] rounded-full shrink-0', getStatusDot(officer.status))} />
          <span className="text-[11.5px] text-[#8ea4bd]">{getStatusLabel(officer.status)}</span>
        </span>
        <div className="col-span-2 flex items-center gap-2">
          <span className="text-[11.5px] text-[#8ea4bd]">{formatDate(officer.hireDate)}</span>
          {officer.notes && <StickyNote size={11} className="text-[#4a6585]" strokeWidth={1.75} />}
        </div>
      </div>

      {allTrainings.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTrainings.map((t) => {
            const ot = officer.trainings.find((x) => x.trainingId === t.id)
            const completed = ot?.completed || false
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTrainToggle(officer.id, t.id, !completed)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[10.5px] font-medium border transition-colors',
                  completed
                    ? 'bg-[#d4af37]/15 border-[#d4af37]/40 text-[#e6d27a]'
                    : 'bg-[#0b1f3a] border-[#18385f]/60 text-[#6b8299] hover:border-[#234568]'
                )}
              >
                <span
                  className={cn(
                    'h-[10px] w-[10px] rounded-[3px] flex items-center justify-center',
                    completed ? 'bg-[#d4af37]' : 'bg-[#18385f]'
                  )}
                >
                  {completed && <Check size={7} className="text-[#0b1f3a]" strokeWidth={3} />}
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function OfficersPage() {
  const { data: officers, loading, refetch, setData } = useFetch<Officer[]>('/api/officers')
  const { data: ranks } = useFetch<Rank[]>('/api/ranks')
  const { data: units } = useFetch<Unit[]>('/api/units?active=true')
  const { addToast } = useToast()
  const { user } = useAuth()
  const canEdit = hasPermission(user, 'officers:write')
  const canMove = hasPermission(user, 'rank-changes:manage')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rankFilter, setRankFilter] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [flagFilter, setFlagFilter] = useState('')
  const [collapsedRanks, setCollapsedRanks] = useState<Set<string>>(new Set())
  const [movePending, setMovePending] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const filteredOfficers = useMemo(() => {
    if (!officers) return []
    return officers.filter((o) => {
      if (search) {
        const s = search.toLowerCase()
        if (
          !o.firstName.toLowerCase().includes(s) &&
          !o.lastName.toLowerCase().includes(s) &&
          !o.badgeNumber.toLowerCase().includes(s)
        )
          return false
      }
      if (statusFilter && o.status !== statusFilter) return false
      if (rankFilter && o.rankId !== rankFilter) return false
      if (unitFilter) {
        const officerUnits = officerUnitKeys(o)
        if (unitFilter === '__none__' ? officerUnits.length > 0 : !officerUnits.includes(unitFilter)) return false
      }
      if (flagFilter) {
        if (flagFilter === '__any__' ? !o.flag : o.flag !== flagFilter) return false
      }
      return true
    })
  }, [officers, search, statusFilter, rankFilter, unitFilter, flagFilter])

  const unitsByKey = useMemo(() => new Map((units ?? []).map((unit) => [unit.key, unit])), [units])

  const groupedByRank = useMemo(() => {
    const groups: Map<string, { rank: Rank; officers: Officer[] }> = new Map()
    for (const officer of filteredOfficers) {
      const key = officer.rankId
      if (!groups.has(key)) {
        groups.set(key, { rank: officer.rank, officers: [] })
      }
      groups.get(key)!.officers.push(officer)
    }
    const result = Array.from(groups.values()).sort(
      (a, b) => a.rank.sortOrder - b.rank.sortOrder
    )
    for (const group of result) {
      group.officers.sort((a, b) => compareBadgeNumbers(a.badgeNumber, b.badgeNumber))
    }
    return result
  }, [filteredOfficers])

  const allTrainings = useMemo(() => {
    if (!officers || officers.length === 0) return []
    const first = officers.find((o) => o.trainings.length > 0)
    if (!first) return []
    return first.trainings.map((t) => t.training).sort((a, b) => a.sortOrder - b.sortOrder)
  }, [officers])

  const toggleRankCollapse = (rankId: string) => {
    setCollapsedRanks((prev) => {
      const next = new Set(prev)
      if (next.has(rankId)) next.delete(rankId)
      else next.add(rankId)
      return next
    })
  }

  const handleTrainingToggle = useCallback(
    async (officerId: string, trainingId: string, completed: boolean) => {
      const list = officers
      const o = list?.find((x) => x.id === officerId)
      if (!o) return
      const previousTrainings = o.trainings.map((t) => ({ ...t }))
      setData((prev) => {
        if (!prev) return prev
        return prev.map((row) => {
          if (row.id !== officerId) return row
          return {
            ...row,
            trainings: row.trainings.map((t) =>
              t.trainingId === trainingId ? { ...t, completed } : t
            ),
          }
        })
      })
      const trainings = o.trainings.map((t) => ({
        trainingId: t.trainingId,
        completed: t.trainingId === trainingId ? completed : t.completed,
      }))
      try {
        const res = await fetch(`/api/officers/${officerId}/trainings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trainings }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Fehler')
        if (json.data?.officer) {
          setData((prev) => {
            if (!prev) return prev
            return prev.map((row) => (row.id === officerId ? json.data.officer : row))
          })
        }
      } catch {
        setData((prev) => {
          if (!prev) return prev
          return prev.map((row) =>
            row.id === officerId ? { ...row, trainings: previousTrainings } : row
          )
        })
        addToast({ type: 'error', title: 'Fehler beim Aktualisieren' })
      }
    },
    [officers, setData, addToast]
  )

  const handleFlagChange = useCallback(
    async (officerId: string, flag: string | null) => {
      const previous = officers?.find((x) => x.id === officerId)?.flag ?? null
      setData((prev) => {
        if (!prev) return prev
        return prev.map((row) => (row.id === officerId ? { ...row, flag } : row))
      })
      try {
        const res = await fetch(`/api/officers/${officerId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flag }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Fehler')
      } catch (e) {
        setData((prev) => {
          if (!prev) return prev
          return prev.map((row) => (row.id === officerId ? { ...row, flag: previous } : row))
        })
        addToast({
          type: 'error',
          title: 'Markierung konnte nicht gespeichert werden',
          message: e instanceof Error ? e.message : '',
        })
      }
    },
    [officers, setData, addToast]
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return
      const aid = String(active.id)
      const oid = String(over.id)
      if (!aid.startsWith('drag-') || !oid.startsWith('drop-')) return
      const officerId = aid.slice(5)
      const targetRankId = oid.slice(5)
      const o = officers?.find((x) => x.id === officerId)
      if (!o || o.rankId === targetRankId) return
      setMovePending(true)
      try {
        const res = await fetch(`/api/officers/${officerId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetRankId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Fehler')
        setData((prev) => {
          if (!prev) return prev
          return prev.map((row) => (row.id === officerId ? json.data : row))
        })
        addToast({ type: 'success', title: 'Rang & Dienstnummer aktualisiert' })
      } catch (e) {
        addToast({
          type: 'error',
          title: 'Verschieben fehlgeschlagen',
          message: e instanceof Error ? e.message : '',
        })
        await refetch()
      } finally {
        setMovePending(false)
      }
    },
    [officers, setData, addToast, refetch]
  )

  if (loading) return <PageLoader />

  const filterClass =
    'h-[36px] sm:h-[34px] px-3 rounded-[8px] text-[13px] bg-[#0b1f3a] text-[#b7c5d8] border border-[#18385f]/50 focus:outline-none focus:border-[#d4af37] transition-all'
  const totalActive = officers?.filter((o) => o.status === 'ACTIVE').length || 0
  const totalAway = officers?.filter((o) => o.status === 'AWAY').length || 0
  const totalFlagged = officers?.filter((o) => o.flag).length || 0

  return (
    <div>
      <PageHeader
        title="Officers"
        description={
          canMove
            ? `${filteredOfficers.length} Mitarbeiter · ${totalActive} aktiv · ${totalAway} abgemeldet${totalFlagged ? ` · ${totalFlagged} markiert` : ''} · Ziehen: Rang wechseln`
            : `${filteredOfficers.length} Mitarbeiter · ${totalActive} aktiv · ${totalAway} abgemeldet${totalFlagged ? ` · ${totalFlagged} markiert` : ''}`
        }
        action={
          <Link href="/officers/new" className="block sm:inline-block">
            <Button size="sm" disabled={movePending} className="w-full sm:w-auto">
              <Plus size={14} strokeWidth={2} />
              Hinzufügen
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-2 mb-5 sm:mb-6">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6585]"
            strokeWidth={1.75}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name oder Dienstnummer..."
            className={cn(filterClass, 'w-full pl-9 placeholder:text-[#4a6585]')}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Select
            size="sm"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[
              { value: '', label: 'Alle Status' },
              { value: 'ACTIVE', label: 'Aktiv' },
              { value: 'AWAY', label: 'Abgemeldet' },
              { value: 'INACTIVE', label: 'Inaktiv' },
            ]}
          />

          <Select
            size="sm"
            value={rankFilter}
            onValueChange={setRankFilter}
            options={[
              { value: '', label: 'Alle Ränge' },
              ...(ranks?.map((r) => ({ value: r.id, label: r.name })) || []),
            ]}
          />

          <Select
            size="sm"
            value={unitFilter}
            onValueChange={setUnitFilter}
            options={[
              { value: '', label: 'Alle Units' },
              { value: '__none__', label: 'Ohne Unit' },
              ...(units?.map((u) => ({ value: u.key, label: u.name })) || []),
            ]}
          />

          <Select
            size="sm"
            value={flagFilter}
            onValueChange={setFlagFilter}
            options={[
              { value: '', label: 'Alle Markierungen' },
              { value: '__any__', label: 'Markiert' },
              ...OFFICER_FLAG_VALUES.map((f) => ({ value: f, label: getFlagLabel(f) })),
            ]}
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragEnd={canMove ? handleDragEnd : () => {}}
        collisionDetection={rankDropCollision}
      >
        <div className="rounded-[12px] overflow-hidden">
          {groupedByRank.length === 0 && (
            <div className="text-center py-24">
              <Users size={28} className="mx-auto text-[#4a6585] mb-3" strokeWidth={1.5} />
              <p className="text-[13px] text-[#8ea4bd]">Keine Officers gefunden</p>
            </div>
          )}

          {groupedByRank.map(({ rank, officers: groupOfficers }, groupIndex) => {
            const isCollapsed = collapsedRanks.has(rank.id)
            return (
              <div key={rank.id} className={cn(groupIndex > 0 && 'mt-1')}>
                <DropRankZone rankId={rank.id} canHighlight={canMove}>
                  <button
                    type="button"
                    onClick={() => toggleRankCollapse(rank.id)}
                    className="w-full flex items-center gap-2.5 px-3 sm:px-4 py-2 rounded-[8px] hover:bg-[#0f2340] transition-colors group"
                  >
                    <ChevronDown
                      size={14}
                      strokeWidth={2}
                      className={cn('text-[#4a6585] transition-transform duration-200 shrink-0', isCollapsed && '-rotate-90')}
                    />
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: rank.color }} />
                    <span className="text-[13px] font-semibold text-[#eee] truncate">{rank.name}</span>
                    <span className="text-[12px] text-[#4a6585] font-normal shrink-0">{groupOfficers.length}</span>
                    {rank.badgeMin != null && rank.badgeMax != null && (
                      <span className="hidden sm:inline text-[10px] text-[#4a6585] ml-auto font-mono">
                        DN {rank.badgeMin}–{rank.badgeMax}
                      </span>
                    )}
                  </button>

                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        {/* Desktop / tablet: table view */}
                        <div className="hidden lg:block glass-panel rounded-[10px] overflow-hidden mt-1 mb-2">
                          <table className="w-full table-fixed">
                            <thead>
                              <tr>
                                <th className="w-[3px] p-0" />
                                <th className="w-7 px-1 py-2.5" />
                                <th className="px-2 py-2.5 text-left text-[11px] font-medium text-[#6b8299] w-16">DN</th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-[#6b8299] min-w-[160px]">Name</th>
                                {allTrainings.map((t) => (
                                  <th
                                    key={t.id}
                                    className="px-2 py-2.5 text-center text-[10.5px] font-medium text-[#6b8299] w-[104px]"
                                    title={t.label}
                                  >
                                    <span className="block mx-auto max-w-[92px] whitespace-normal break-words leading-tight">
                                      {t.label}
                                    </span>
                                  </th>
                                ))}
                                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-[#6b8299] w-[110px]">Unit</th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-[#6b8299] w-[110px]">Status</th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-[#6b8299] w-[100px]">Einstellung</th>
                                <th className="px-2 py-2.5 w-[56px] text-center text-[11px] font-medium text-[#6b8299]">
                                  <Flag size={11} className="inline" strokeWidth={1.75} />
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {groupOfficers.map((officer, i) => (
                                <DraggableOfficerRow
                                  key={officer.id}
                                  officer={officer}
                                  canDrag={canMove}
                                  canEdit={canEdit}
                                  allTrainings={allTrainings}
                                  unitsByKey={unitsByKey}
                                  rowIndex={i}
                                  onTrainToggle={handleTrainingToggle}
                                  onFlagChange={handleFlagChange}
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile / tablet: card view */}
                        <div className="lg:hidden mt-1 mb-2 space-y-1.5">
                          {groupOfficers.map((officer) => (
                            <MobileOfficerCard
                              key={officer.id}
                              officer={officer}
                              allTrainings={allTrainings}
                              unitsByKey={unitsByKey}
                              canEdit={canEdit}
                              onTrainToggle={handleTrainingToggle}
                              onFlagChange={handleFlagChange}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </DropRankZone>
              </div>
            )
          })}
        </div>
      </DndContext>
    </div>
  )
}
