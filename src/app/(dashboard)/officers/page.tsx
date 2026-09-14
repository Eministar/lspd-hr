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
import { Search, Plus, ChevronDown, Users, Check, StickyNote, GripVertical, Flag, MessageCircle, CircleSlash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Select } from '@/components/ui/select'
import { fieldClass } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { UnitBadges } from '@/components/officers/unit-badges'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useAuth } from '@/context/auth-context'
import {
  cn,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getStatusLabel,
  getStatusDot,
  getFlagLabel,
  getFlagColor,
  getFlagRowClass,
  compareBadgeNumbers,
} from '@/lib/utils'
import { OFFICER_FLAG_VALUES } from '@/lib/validations/officer'
import { hasPermission } from '@/lib/permissions'
import { officerUnitKeys } from '@/lib/officer-units'
import { notifyLiveUpdate } from '@/lib/live-updates'
import { displayBadgeNumber, formatBadgeNumber } from '@/lib/badge-number'
import { OfficerAvatar } from '@/components/officers/officer-avatar'
import { RankNumberBadge } from '@/components/ranks/rank-number-badge'
import { ScrollShelf } from '@/components/ui/scroll-shelf'

interface Training {
  id: string
  key: string
  label: string
  sortOrder: number
  minRankId: string | null
  minRank: { id: string; name: string; sortOrder: number } | null
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
  internalNumber: number | null
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
  avatarUrl: string | null
  discordMember?: {
    checked: boolean
    inGuild: boolean
  }
  trainings: OfficerTraining[]
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
        'w-full min-w-0 rounded-[10px] transition-[box-shadow] duration-150',
        canHighlight && isOver && 'ring-1 ring-gold/50 ring-inset'
      )}
    >
      {children}
    </div>
  )
}

const FLAG_OPTIONS: Array<{ id: string | null; label: string; color: string }> = [
  { id: null, label: 'Keine', color: 'transparent' },
  { id: 'RED', label: 'Rot', color: '#ff453a' },
  { id: 'ORANGE', label: 'Orange', color: '#ff9f0a' },
  { id: 'YELLOW', label: 'Gelb', color: '#ffd60a' },
  { id: 'BLUE', label: 'Blau', color: '#64d2ff' },
]

function trainingAvailableForOfficer(training: Training, officer: Officer) {
  return !training.minRank || officer.rank.sortOrder <= training.minRank.sortOrder
}

function DiscordMemberBadge({ officer, compact = false }: { officer: Pick<Officer, 'discordId' | 'discordMember'>; compact?: boolean }) {
  const hasDiscordId = !!officer.discordId
  const checked = !!officer.discordMember?.checked
  const inGuild = !!officer.discordMember?.inGuild
  const label = !hasDiscordId
    ? 'Nicht verknüpft'
    : checked
      ? inGuild ? 'Auf Discord' : 'Nicht auf Discord'
      : 'Discord ungeprüft'
  const className = !hasDiscordId || !checked
    ? 'bg-white/[0.06] text-label-3'
    : inGuild
      ? 'bg-green/12 text-green'
      : 'bg-red/12 text-red'
  const Icon = hasDiscordId && checked && inGuild ? MessageCircle : CircleSlash

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium',
        compact ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-[12px]',
        className
      )}
      title={hasDiscordId ? `Discord-ID: ${officer.discordId}` : 'Keine Discord-ID am Officer hinterlegt'}
    >
      <Icon size={compact ? 10 : 11} strokeWidth={2} />
      {label}
    </span>
  )
}

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
        'inline-flex items-center justify-center rounded-full border transition-[scale,border-color] duration-150 ease-out',
        dim,
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'hover:scale-110 active:scale-95',
        value ? 'border-transparent' : 'border-line-strong hover:border-white/30'
      )}
      style={{ backgroundColor: value ? getFlagColor(value) : 'transparent' }}
      onClick={(e) => e.stopPropagation()}
    >
      {!value && <Flag size={size === 'lg' ? 13 : 10} className="text-label-4" strokeWidth={1.75} />}
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
          className="lspd-popover z-[200] rounded-full p-1.5 data-[state=open]:animate-[lspd-pop-in_160ms_var(--ease-apple)]"
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
                      'flex h-7 w-7 items-center justify-center rounded-full border transition-[scale,box-shadow] duration-150 hover:scale-110 active:scale-95',
                      active ? 'border-transparent ring-2 ring-label ring-offset-2 ring-offset-surface-3' : 'border-line-strong'
                    )}
                    style={{ backgroundColor: opt.id ? opt.color : 'transparent' }}
                  >
                    {!opt.id && <Flag size={12} className="text-label-2" strokeWidth={1.75} />}
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
  canEditTrainings,
  allTrainings,
  unitsByKey,
  rowIndex,
  onTrainToggle,
  onFlagChange,
}: {
  officer: Officer
  canDrag: boolean
  canEdit: boolean
  canEditTrainings: boolean
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
        'group transition-colors duration-100',
        officer.flag ? getFlagRowClass(officer.flag) : 'hover:bg-surface-2',
        isDragging && 'opacity-40 z-10',
        rowIndex > 0 && 'border-t border-line'
      )}
    >
      <td className="w-[3px] p-0" aria-hidden />
      <td className="px-1 py-2 w-7 text-center">
        {canDrag ? (
          <button
            type="button"
            className="inline-flex cursor-grab rounded-[6px] p-1 text-label-4 transition-colors hover:bg-white/[0.06] hover:text-label-2 active:cursor-grabbing"
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
      <td className="px-2 py-2.5 align-middle font-mono text-[12.5px] tabular-nums text-label-2">
        <span className="inline-flex items-center gap-1.5">
          {officer.flag && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: getFlagColor(officer.flag) }}
              aria-label={`Markierung: ${getFlagLabel(officer.flag)}`}
            />
          )}
          {displayBadgeNumber(officer.badgeNumber)}
        </span>
      </td>
      <td
        className="sticky left-0 z-[1] min-w-0 overflow-hidden bg-surface group-hover:bg-[color-mix(in_srgb,#fff_2.5%,var(--color-surface))] px-3 py-2.5 align-middle shadow-[1px_0_0_var(--color-line)]"
        // Markierte Zeilen sind leicht eingefärbt; die deckende Sticky-Zelle übernimmt den Ton.
        style={officer.flag ? { backgroundColor: `color-mix(in srgb, ${getFlagColor(officer.flag)} 7%, var(--color-surface))` } : undefined}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <OfficerAvatar officer={officer} size="sm" ringColor={officer.rank.color} />
          <Link
            href={`/officers/${officer.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-[13.5px] font-medium text-label transition-colors hover:text-gold-bright"
            title={`${officer.firstName} ${officer.lastName}`}
          >
            {officer.firstName} {officer.lastName}
          </Link>
        </div>
      </td>
      {allTrainings.map((t) => {
        const ot = officer.trainings.find((x) => x.trainingId === t.id)
        const completed = ot?.completed || false
        const available = trainingAvailableForOfficer(t, officer)
        return (
          <td key={t.id} className="px-1.5 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onTrainToggle(officer.id, t.id, !completed)}
              disabled={!canEditTrainings}
              title={!available ? `${t.label} ist erst ab ${t.minRank?.name ?? 'Mindestrang'} vorgesehen` : t.label}
              className={cn(
                'mx-auto flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-[background-color,border-color,scale] duration-150 ease-out',
                completed
                  ? 'border-gold bg-gold shadow-[inset_0_0.5px_0_rgb(255_255_255/0.35)]'
                  : available
                    ? 'border-line-strong bg-white/[0.04]'
                    : 'border-dashed border-line-strong bg-transparent opacity-60',
                canEditTrainings
                  ? cn('active:scale-90', !completed && 'hover:border-white/30 hover:bg-white/[0.08]')
                  : 'cursor-not-allowed opacity-60'
              )}
            >
              {completed && <Check size={12} className="text-ink" strokeWidth={3.25} />}
            </button>
          </td>
        )
      })}
      <td className="px-2 py-2.5 whitespace-nowrap">
        <UnitBadges officer={officer} unitsByKey={unitsByKey} maxVisible={2} />
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-[6px] w-[6px] rounded-full', getStatusDot(officer.status))} />
          <span className="text-[12px] text-label-2">{getStatusLabel(officer.status)}</span>
        </span>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        <DiscordMemberBadge officer={officer} compact />
      </td>
      <td className="px-2 py-2.5 text-[12px] text-label-2" title={officer.lastOnline ? formatDateTime(officer.lastOnline) : 'Nie online gewesen'}>
        {officer.lastOnline ? formatRelativeTime(officer.lastOnline) : 'Nie'}
      </td>
      <td className="px-2 py-2.5 text-[12px] text-label-2">{formatDate(officer.hireDate)}</td>
      <td className="px-1.5 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex items-center gap-1.5">
          <FlagButton
            value={officer.flag}
            disabled={!canEdit}
            onChange={(v) => onFlagChange(officer.id, v)}
          />
          {officer.notes && <StickyNote size={12} className="text-label-4" strokeWidth={1.75} />}
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
  canEditTrainings,
  onTrainToggle,
  onFlagChange,
}: {
  officer: Officer
  allTrainings: Training[]
  unitsByKey: Map<string, Unit>
  canEdit: boolean
  canEditTrainings: boolean
  onTrainToggle: (id: string, trainingId: string, done: boolean) => void
  onFlagChange: (id: string, flag: string | null) => void
}) {
  return (
    <div
      className={cn(
        'relative w-full rounded-[12px] border border-line px-4 py-3.5 transition-colors',
        officer.flag ? getFlagRowClass(officer.flag) : 'bg-surface'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <OfficerAvatar officer={officer} ringColor={officer.rank.color} />
          <div className="min-w-0">
            <span className="mb-1 block font-mono text-[11px] text-label-2">
              {displayBadgeNumber(officer.badgeNumber)}
            </span>
            <Link
              href={`/officers/${officer.id}`}
              className="block truncate text-[14px] font-semibold text-label transition-colors hover:text-gold-bright"
            >
              {officer.firstName} {officer.lastName}
            </Link>
          </div>
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
            <UnitBadges officer={officer} unitsByKey={unitsByKey} maxVisible={3} />
          ) : (
            <span className="text-[11px] text-label-4">—</span>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 justify-self-end whitespace-nowrap pt-[3px]">
          <span className={cn('h-[6px] w-[6px] rounded-full shrink-0', getStatusDot(officer.status))} />
          <span className="text-[11.5px] text-label-2">{getStatusLabel(officer.status)}</span>
        </span>
        <div className="col-span-2 flex items-center gap-2">
          <DiscordMemberBadge officer={officer} compact />
          <span className="text-[11.5px] text-label-2">
            Zuletzt online: {officer.lastOnline ? formatRelativeTime(officer.lastOnline) : 'Nie'}
          </span>
          <span className="text-[11.5px] text-label-2">{formatDate(officer.hireDate)}</span>
          {officer.notes && <StickyNote size={11} className="text-label-4" strokeWidth={1.75} />}
        </div>
      </div>

      {allTrainings.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTrainings.map((t) => {
            const ot = officer.trainings.find((x) => x.trainingId === t.id)
            const completed = ot?.completed || false
            const available = trainingAvailableForOfficer(t, officer)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTrainToggle(officer.id, t.id, !completed)}
                disabled={!canEditTrainings}
                title={!available ? `${t.label} ist erst ab ${t.minRank?.name ?? 'Mindestrang'} vorgesehen` : t.label}
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium transition-[background-color,border-color,scale] duration-150 active:scale-95',
                  completed
                    ? 'border-transparent bg-gold/15 text-gold-bright'
                    : available
                      ? 'border-line bg-white/[0.04] text-label-2'
                      : 'border-dashed border-line-strong bg-transparent text-label-4',
                  canEditTrainings ? 'hover:bg-white/[0.08]' : 'cursor-not-allowed opacity-70'
                )}
              >
                <span
                  className={cn(
                    'h-[10px] w-[10px] rounded-[3px] flex items-center justify-center',
                    completed ? 'bg-gold' : 'bg-surface-3'
                  )}
                >
                  {completed && <Check size={7} className="text-ink" strokeWidth={3} />}
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
  const { addToast } = useToast()
  const { user } = useAuth()
  const canView = hasPermission(user, 'officers:view')
  const canEdit = hasPermission(user, 'officers:write')
  const canEditTrainings = hasPermission(user, 'officer-trainings:manage')
  const canMove = hasPermission(user, 'rank-changes:manage')
  const { data: officers, loading, refetch, setData } = useFetch<Officer[]>(canView ? '/api/officers' : null)
  const { data: ranks } = useFetch<Rank[]>(canView ? '/api/ranks' : null)
  const { data: units } = useFetch<Unit[]>(canView ? '/api/units?active=true' : null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rankFilter, setRankFilter] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [flagFilter, setFlagFilter] = useState('')
  const [collapsedRanks, setCollapsedRanks] = useState<Set<string>>(new Set())
  const [movePending, setMovePending] = useState(false)
  const [pendingTrainingOverride, setPendingTrainingOverride] = useState<{
    officer: Officer
    training: Training
    completed: boolean
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const filteredOfficers = useMemo(() => {
    if (!officers) return []
    return officers.filter((o) => {
      if (search) {
        const trimmedSearch = search.trim()
        const s = trimmedSearch.toLowerCase()
        const canSearchDiscordId = /^\d{17,22}$/.test(trimmedSearch)
        if (
          !o.firstName.toLowerCase().includes(s) &&
          !o.lastName.toLowerCase().includes(s) &&
          !o.badgeNumber.toLowerCase().includes(s) &&
          !(canSearchDiscordId && o.discordId?.toLowerCase().includes(s))
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
    const showEmptyRanks = !search.trim() && !statusFilter && !unitFilter && !flagFilter
    if (showEmptyRanks) {
      for (const rank of ranks ?? []) {
        if (rankFilter && rank.id !== rankFilter) continue
        groups.set(rank.id, { rank, officers: [] })
      }
    }
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
  }, [filteredOfficers, ranks, rankFilter, search, statusFilter, unitFilter, flagFilter])

  const allTrainings = useMemo(() => {
    if (!officers || officers.length === 0) return []
    const byId = new Map<string, Training>()
    for (const officer of officers) {
      for (const row of officer.trainings) {
        byId.set(row.training.id, row.training)
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder)
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
    async (officerId: string, trainingId: string, completed: boolean, overrideConfirmed = false) => {
      if (!canEditTrainings) return
      const list = officers
      const o = list?.find((x) => x.id === officerId)
      if (!o) return
      const trainingRow = o.trainings.find((t) => t.trainingId === trainingId)
      if (!trainingRow) return
      const requiresOverride = completed && !trainingAvailableForOfficer(trainingRow.training, o)
      if (requiresOverride && !overrideConfirmed) {
        setPendingTrainingOverride({ officer: o, training: trainingRow.training, completed })
        return
      }
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
          body: JSON.stringify({
            trainings,
            overrideTrainingIds: requiresOverride && overrideConfirmed ? [trainingId] : [],
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Fehler')
        if (json.data?.officer) {
          setData((prev) => {
            if (!prev) return prev
            return prev.map((row) => (row.id === officerId ? json.data.officer : row))
          })
        }
        notifyLiveUpdate()
      } catch (err) {
        setData((prev) => {
          if (!prev) return prev
          return prev.map((row) =>
            row.id === officerId ? { ...row, trainings: previousTrainings } : row
          )
        })
        addToast({
          type: 'error',
          title: 'Fehler beim Aktualisieren',
          message: err instanceof Error ? err.message : '',
        })
      }
    },
    [canEditTrainings, officers, setData, addToast]
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
        notifyLiveUpdate()
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
        notifyLiveUpdate()
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

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  const totalActive = officers?.filter((o) => o.status === 'ACTIVE').length || 0
  const totalAway = officers?.filter((o) => o.status === 'AWAY').length || 0
  const totalFlagged = officers?.filter((o) => o.flag).length || 0

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Officers"
        description={
          canMove
            ? `${filteredOfficers.length} Mitarbeiter · ${totalActive} aktiv · ${totalAway} abgemeldet${totalFlagged ? ` · ${totalFlagged} markiert` : ''} · Ziehen: Rang wechseln`
            : `${filteredOfficers.length} Mitarbeiter · ${totalActive} aktiv · ${totalAway} abgemeldet${totalFlagged ? ` · ${totalFlagged} markiert` : ''}`
        }
        action={canEdit ? (
          <Link href="/officers/new" className="block sm:inline-block">
            <Button disabled={movePending} className="w-full sm:w-auto">
              <Plus size={15} strokeWidth={2} />
              Hinzufügen
            </Button>
          </Link>
        ) : undefined}
      />

      <div className="mb-6 flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="relative xl:w-[340px] xl:shrink-0">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-3"
            strokeWidth={2}
          />
          <input
            type="search"
            aria-label="Officers durchsuchen"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name, Dienstnummer oder Discord-ID..."
            className={cn(fieldClass, 'h-[34px] pl-8 pr-3')}
          />
        </div>

        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
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
        <div className="w-full min-w-0 rounded-[12px] overflow-hidden">
          {groupedByRank.length === 0 && (
            <div className="text-center py-24">
              <Users size={28} className="mx-auto text-label-4 mb-3" strokeWidth={1.5} />
              <p className="text-[13px] text-label-2">Keine Ränge gefunden</p>
            </div>
          )}

          {groupedByRank.map(({ rank, officers: groupOfficers }, groupIndex) => {
            const isCollapsed = collapsedRanks.has(rank.id)
            return (
              <div key={rank.id} className={cn('w-full min-w-0', groupIndex > 0 && 'mt-4')}>
                <DropRankZone rankId={rank.id} canHighlight={canMove}>
                  <button
                    type="button"
                    onClick={() => toggleRankCollapse(rank.id)}
                    aria-expanded={!isCollapsed}
                    className="group flex h-10 w-full items-center gap-2.5 rounded-[8px] px-2 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-gold/45"
                  >
                    <ChevronDown
                      size={15}
                      strokeWidth={2.25}
                      className={cn('shrink-0 text-label-3 transition-[rotate,color] duration-300 ease-apple group-hover:text-label-2', isCollapsed && '-rotate-90')}
                    />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: rank.color }} />
                    <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-label">{rank.name}</span>
                    <RankNumberBadge number={rank.internalNumber} />
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-white/[0.07] px-2 text-[12px] font-medium tabular-nums text-label-2">{groupOfficers.length}</span>
                    {rank.badgeMin != null && rank.badgeMax != null && (
                      <span className="ml-auto hidden font-mono text-[12px] tabular-nums text-label-4 sm:inline">
                        DN {formatBadgeNumber(rank.badgeMin, '')}–{formatBadgeNumber(rank.badgeMax, '')}
                      </span>
                    )}
                  </button>

                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                        className="overflow-hidden"
                      >
                        {/* Desktop / tablet: table view */}
                        <div className="lspd-card mt-1.5 hidden overflow-hidden lg:block">
                          <ScrollShelf
                            label={`Officers ${rank.name} – Ausbildungstabelle`}
                            itemCount={allTrainings.length}
                            itemNoun="Ausbildungen"
                            itemSelector="th[data-shelf-item]"
                            stickySelector="th[data-shelf-sticky]"
                          >
                          <table className="lspd-table w-full table-fixed" style={{ minWidth: 815 + allTrainings.length * 112 }}>
                            <thead>
                              <tr>
                                <th className="w-[3px] p-0" />
                                <th className="w-[28px] px-1 py-2.5" />
                                <th className="w-[58px] px-2 py-2.5 text-left text-[12px] font-medium text-label-3">DN</th>
                                <th scope="col" data-shelf-sticky className="sticky left-0 z-[2] w-[170px] px-3 py-2.5 text-left text-[12px] font-medium text-label-3 shadow-[1px_0_0_var(--color-line)]">Name</th>
                                {allTrainings.map((t) => (
                                  <th
                                    key={t.id}
                                    scope="col"
                                    data-shelf-item
                                    className="w-[112px] px-2 py-2.5 text-center text-[12px] font-medium text-label-3"
                                    title={t.label}
                                  >
                                    <span lang="de" className="block mx-auto whitespace-normal break-words hyphens-auto leading-relaxed">
                                      {t.label}
                                    </span>
                                  </th>
                                ))}
                                <th className="w-[96px] px-2 py-2.5 text-left text-[12px] font-medium text-label-3">Unit</th>
                                <th className="w-[104px] px-2 py-2.5 text-left text-[12px] font-medium text-label-3">Status</th>
                                <th className="w-[112px] px-2 py-2.5 text-left text-[12px] font-medium text-label-3">Discord</th>
                                <th className="w-[104px] px-2 py-2.5 text-left text-[12px] font-medium text-label-3">Zuletzt Online</th>
                                <th className="w-[96px] px-2 py-2.5 text-left text-[12px] font-medium text-label-3">Einstellung</th>
                                <th className="w-[44px] px-1.5 py-2.5 text-center text-[12px] font-medium text-label-3">
                                  <Flag size={12} className="inline" strokeWidth={1.75} aria-label="Markierung" />
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {groupOfficers.length > 0 ? (
                                groupOfficers.map((officer, i) => (
                                  <DraggableOfficerRow
                                    key={officer.id}
                                    officer={officer}
                                    canDrag={canMove}
                                    canEdit={canEdit}
                                    canEditTrainings={canEditTrainings}
                                    allTrainings={allTrainings}
                                    unitsByKey={unitsByKey}
                                    rowIndex={i}
                                    onTrainToggle={handleTrainingToggle}
                                    onFlagChange={handleFlagChange}
                                  />
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={10 + allTrainings.length} className="px-4 py-4 text-center text-[12.5px] text-label-3">
                                    — Kein Officer hat diesen Rang
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                          </ScrollShelf>
                        </div>

                        {/* Mobile / tablet: card view */}
                        <div className="mt-1.5 w-full min-w-0 space-y-2 lg:hidden">
                          {groupOfficers.length > 0 ? (
                            groupOfficers.map((officer) => (
                              <MobileOfficerCard
                                key={officer.id}
                                officer={officer}
                                allTrainings={allTrainings}
                                unitsByKey={unitsByKey}
                                canEdit={canEdit}
                                canEditTrainings={canEditTrainings}
                                onTrainToggle={handleTrainingToggle}
                                onFlagChange={handleFlagChange}
                              />
                            ))
                          ) : (
                            <div className="rounded-[12px] border border-dashed border-line-strong px-3.5 py-3 text-center text-[13px] text-label-3">
                              — Kein Officer hat diesen Rang
                            </div>
                          )}
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

      <Modal
        open={!!pendingTrainingOverride}
        onClose={() => setPendingTrainingOverride(null)}
        title="Ausbildung außerhalb des Mindestrangs"
      >
        {pendingTrainingOverride && (
          <div className="space-y-4">
            <div className="rounded-[12px] bg-gold/10 px-4 py-3">
              <p className="text-[13.5px] font-semibold text-label">
                {pendingTrainingOverride.training.label}
              </p>
              <p className="mt-1 text-[12.5px] text-gold-bright">
                Vorgesehen ab: {pendingTrainingOverride.training.minRank?.name ?? 'Mindestrang'}
              </p>
            </div>
            <div className="rounded-[12px] bg-white/[0.04] px-4 py-3">
              <p className="text-[12px] text-label-2">Officer</p>
              <p className="mt-1 text-[14px] font-semibold text-label">
                {pendingTrainingOverride.officer.firstName} {pendingTrainingOverride.officer.lastName}
              </p>
              <p className="mt-1 text-[12.5px] text-label-2">
                DN {displayBadgeNumber(pendingTrainingOverride.officer.badgeNumber)} · {pendingTrainingOverride.officer.rank.name}
              </p>
            </div>
            <p className="text-[13px] leading-relaxed text-label-2">
              Möchtest du diese Ausbildung wirklich exakt diesem Officer geben?
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setPendingTrainingOverride(null)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => {
                  const pending = pendingTrainingOverride
                  setPendingTrainingOverride(null)
                  void handleTrainingToggle(pending.officer.id, pending.training.id, pending.completed, true)
                }}
              >
                Bestätigen
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
