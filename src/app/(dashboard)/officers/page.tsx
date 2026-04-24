'use client'

import { useState, useMemo, useCallback, type ReactNode, type CSSProperties } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
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
import { Search, Plus, ChevronDown, Users, Check, StickyNote, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useAuth } from '@/context/auth-context'
import { cn, formatDate, getStatusLabel, getStatusDot } from '@/lib/utils'

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

interface Officer {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  rank: Rank
  rankId: string
  discordId: string | null
  status: string
  notes: string | null
  hireDate: string
  lastOnline: string | null
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
        'rounded-[10px] transition-[box-shadow] duration-150',
        canHighlight && isOver && 'ring-1 ring-[#d4af37]/50 ring-inset'
      )}
    >
      {children}
    </div>
  )
}

function DraggableOfficerRow({
  officer,
  canDrag,
  allTrainings,
  rowIndex,
  onTrainToggle,
}: {
  officer: Officer
  canDrag: boolean
  allTrainings: Training[]
  rowIndex: number
  onTrainToggle: (id: string, trainingId: string, done: boolean) => void
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
        'hover:bg-[#0f2340] transition-colors duration-100',
        isDragging && 'opacity-40 z-10',
        rowIndex > 0 && 'border-t border-[#18385f]'
      )}
    >
      <td className="px-1.5 py-2 w-8 text-center">
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
      <td className="px-2 py-2.5 font-mono text-[12px] text-[#b7c5d8]">
        {officer.badgeNumber}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap min-w-0">
        <Link
          href={`/officers/${officer.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[13px] font-medium text-[#eee] hover:text-[#d4af37] transition-colors"
        >
          {officer.firstName} {officer.lastName}
        </Link>
        {officer.discordId && (
          <span className="text-[11px] text-[#4a6585] font-mono ml-2">{officer.discordId}</span>
        )}
      </td>
      {allTrainings.map((t) => {
        const ot = officer.trainings.find((x) => x.trainingId === t.id)
        const completed = ot?.completed || false
        return (
          <td key={t.id} className="px-2.5 py-2.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onTrainToggle(officer.id, t.id, !completed)}
              className={cn(
                'h-[18px] w-[18px] rounded-[4px] flex items-center justify-center transition-all duration-150',
                completed ? 'bg-[#d4af37]' : 'bg-[#18385f] hover:bg-[#1e3a5f]'
              )}
            >
              {completed && <Check size={11} className="text-[#0b1f3a]" strokeWidth={3} />}
            </button>
          </td>
        )
      })}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-[6px] w-[6px] rounded-full', getStatusDot(officer.status))} />
          <span className="text-[12px] text-[#8ea4bd]">{getStatusLabel(officer.status)}</span>
        </span>
      </td>
      <td className="px-3 py-2.5 text-[12px] text-[#8ea4bd]">{formatDate(officer.hireDate)}</td>
      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
        {officer.notes && <StickyNote size={12} className="text-[#4a6585]" strokeWidth={1.75} />}
      </td>
    </tr>
  )
}

export default function OfficersPage() {
  const { data: officers, loading, refetch, setData } = useFetch<Officer[]>('/api/officers')
  const { data: ranks } = useFetch<Rank[]>('/api/ranks')
  const { addToast } = useToast()
  const { user } = useAuth()
  const canMove = user?.role === 'ADMIN' || user?.role === 'HR'

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rankFilter, setRankFilter] = useState('')
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
          !o.badgeNumber.toLowerCase().includes(s) &&
          !(o.discordId || '').toLowerCase().includes(s)
        )
          return false
      }
      if (statusFilter && o.status !== statusFilter) return false
      if (rankFilter && o.rankId !== rankFilter) return false
      return true
    })
  }, [officers, search, statusFilter, rankFilter])

  const groupedByRank = useMemo(() => {
    const groups: Map<string, { rank: Rank; officers: Officer[] }> = new Map()
    for (const officer of filteredOfficers) {
      const key = officer.rankId
      if (!groups.has(key)) {
        groups.set(key, { rank: officer.rank, officers: [] })
      }
      groups.get(key)!.officers.push(officer)
    }
    return Array.from(groups.values()).sort((a, b) => a.rank.sortOrder - b.rank.sortOrder)
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
    'h-[34px] px-3 rounded-[8px] text-[13px] bg-[#0b1f3a] text-[#b7c5d8] border border-[#18385f]/50 focus:outline-none focus:border-[#d4af37] transition-all'
  const totalActive = officers?.filter((o) => o.status === 'ACTIVE').length || 0
  const totalAway = officers?.filter((o) => o.status === 'AWAY').length || 0

  return (
    <div>
      <PageHeader
        title="Officers"
        description={
          canMove
            ? `${filteredOfficers.length} Mitarbeiter · ${totalActive} aktiv · ${totalAway} abgemeldet · Ziehen: Rang wechseln`
            : `${filteredOfficers.length} Mitarbeiter · ${totalActive} aktiv · ${totalAway} abgemeldet`
        }
        action={
          <Link href="/officers/new">
            <Button size="sm" disabled={movePending}>
              <Plus size={14} strokeWidth={2} />
              Hinzufügen
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6585]"
            strokeWidth={1.75}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name, Dienstnummer oder Discord..."
            className={cn(filterClass, 'w-full pl-9 placeholder:text-[#4a6585]')}
          />
        </div>

        <Select
          size="sm"
          className="sm:flex-1 sm:min-w-[160px]"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={[
            { value: '', label: 'Alle Status' },
            { value: 'ACTIVE', label: 'Aktiv' },
            { value: 'AWAY', label: 'Abgemeldet' },
            { value: 'INACTIVE', label: 'Inaktiv' },
            { value: 'TERMINATED', label: 'Gekündigt' },
          ]}
        />

        <Select
          size="sm"
          className="sm:flex-1 sm:min-w-[200px]"
          value={rankFilter}
          onValueChange={setRankFilter}
          options={[
            { value: '', label: 'Alle Ränge' },
            ...(ranks?.map((r) => ({ value: r.id, label: r.name })) || []),
          ]}
        />
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
                    className="w-full flex items-center gap-2.5 px-4 py-2 rounded-[8px] hover:bg-[#0f2340] transition-colors group"
                  >
                    <ChevronDown
                      size={14}
                      strokeWidth={2}
                      className={cn('text-[#4a6585] transition-transform duration-200', isCollapsed && '-rotate-90')}
                    />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: rank.color }} />
                    <span className="text-[13px] font-semibold text-[#eee]">{rank.name}</span>
                    <span className="text-[12px] text-[#4a6585] font-normal">{groupOfficers.length}</span>
                    {rank.badgeMin != null && rank.badgeMax != null && (
                      <span className="text-[10px] text-[#4a6585] ml-auto font-mono">
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
                        <div className="glass-panel rounded-[10px] overflow-hidden mt-1 mb-2">
                          <table className="w-full table-fixed">
                            <thead>
                              <tr>
                                <th className="w-8 px-1 py-2.5" />
                                <th className="px-2 py-2.5 text-left text-[11px] font-medium text-[#6b8299] w-14">DN</th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-[#6b8299]">Name</th>
                                {allTrainings.map((t) => (
                                  <th
                                    key={t.id}
                                    className="px-2.5 py-2.5 text-left text-[11px] font-medium text-[#6b8299] whitespace-nowrap"
                                  >
                                    {t.label}
                                  </th>
                                ))}
                                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-[#6b8299]">Status</th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-[#6b8299]">Einstellung</th>
                                <th className="px-2 py-2.5 w-6" />
                              </tr>
                            </thead>
                            <tbody>
                              {groupOfficers.map((officer, i) => (
                                <DraggableOfficerRow
                                  key={officer.id}
                                  officer={officer}
                                  canDrag={canMove}
                                  allTrainings={allTrainings}
                                  rowIndex={i}
                                  onTrainToggle={handleTrainingToggle}
                                />
                              ))}
                            </tbody>
                          </table>
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
