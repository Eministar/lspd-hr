'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Play, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatDate } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'

export interface RankChangeEntry {
    id: string
    officer: { id: string; firstName: string; lastName: string; badgeNumber: string }
    currentRank: { name: string; color: string }
    proposedRank: { name: string; color: string }
    newBadgeNumber: string | null
    note: string | null
    executed: boolean
    executedAt: string | null
    createdBy: { id: string; displayName: string } | null
}

export interface RankChangeList {
    id: string
    name: string
    description: string | null
    type: string
    status: string
    createdBy: { displayName: string } | null
    createdAt: string
    entries: RankChangeEntry[]
}

function initials(first: string, last: string) {
    return (first[0] ?? '').toUpperCase() + (last[0] ?? '').toUpperCase()
}

function RankPill({ name, color }: { name: string; color: string }) {
    return (
        <span
            className="inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ borderColor: `${color}55`, backgroundColor: `${color}18`, color }}
        >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
            {name}
    </span>
    )
}

interface RankChangeListCardProps {
    list: RankChangeList
    expanded: boolean
    onToggle: () => void
    variant: 'promotion' | 'demotion'
    canExecute: boolean
    canManage: boolean
    onExecute: (entry: RankChangeEntry) => void
    onUndo?: (entry: RankChangeEntry) => void
    onRemove: (entryId: string) => void
    onAddEntry: () => void
    onDelete: () => void
    canDelete: boolean
    emptyText: string
    addLabel: string
    footerActions?: ReactNode
}

export function RankChangeListCard({
                                       list, expanded, onToggle, variant, canExecute, canManage, onExecute, onUndo, onRemove, onAddEntry, onDelete, canDelete, emptyText, addLabel,
                                   }: RankChangeListCardProps) {
    const total = list.entries.length
    const executed = list.entries.filter((e) => e.executed).length
    const pending = total - executed
    const isDraft = list.status === 'DRAFT'
    const accent = variant === 'promotion' ? '#34d399' : '#f87171'
    const progress = total > 0 ? Math.round((executed / total) * 100) : 0

    return (
        <div className="glass-panel-elevated rounded-[14px] overflow-hidden border border-[#1e3a5c]/45 transition-colors hover:border-[#234568]">
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3.5 px-5 py-4 hover:bg-[#0f2340]/60 transition-colors text-left"
            >
                <ChevronDown size={14} strokeWidth={2.5} className={cn('text-[#4a6585] transition-transform duration-200 shrink-0', !expanded && '-rotate-90')} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold text-white">{list.name}</span>
                        <span className={cn(
                            'inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
                            isDraft ? 'bg-[#fbbf24]/14 text-[#fbbf24]' : 'bg-[#34d399]/14 text-[#34d399]',
                        )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', isDraft ? 'bg-[#fbbf24]' : 'bg-[#34d399]')} />
                            {isDraft ? 'Entwurf' : 'Abgeschlossen'}
            </span>
                    </div>
                    <p className="text-[11.5px] text-[#8ea4bd] mt-1">
                        {formatDate(list.createdAt)} · {list.createdBy?.displayName ?? 'Gelöscht'}
                        {list.description && <span className="text-[#536b86]"> · {list.description}</span>}
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {total > 0 && (
                        <div className="hidden sm:flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2 text-[10.5px] text-[#8ea4bd]">
                                <span><span className="font-semibold text-white">{executed}</span>/{total} durchgeführt</span>
                            </div>
                            <div className="h-1 w-24 rounded-full bg-[#0f2340] overflow-hidden">
                                <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: accent }} />
                            </div>
                        </div>
                    )}
                    {pending > 0 && isDraft && (
                        <span className="text-[10.5px] font-semibold text-[#fbbf24] bg-[#fbbf24]/12 px-2 py-1 rounded-[6px]">
              {pending} offen
            </span>
                    )}
                </div>
            </button>

            {expanded && (
                <div className="px-5 pb-4 border-t border-[#18385f]/40">
                    {list.entries.length > 0 ? (
                        <div className="space-y-1.5 my-3">
                            {list.entries.map((entry) => (
                                <div
                                    key={entry.id}
                                    className={cn(
                                        'flex items-center gap-3 px-3 py-2.5 rounded-[10px] border transition-colors',
                                        entry.executed
                                            ? 'bg-[#0a1f30]/60 border-[#18385f]/30 opacity-80'
                                            : 'bg-[#0f2340]/70 border-[#1e3a5c]/40 hover:border-[#234568]',
                                    )}
                                >
                                    <div
                                        className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold border"
                                        style={{
                                            borderColor: `${entry.proposedRank.color}55`,
                                            backgroundColor: `${entry.proposedRank.color}18`,
                                            color: entry.proposedRank.color,
                                        }}
                                    >
                                        {initials(entry.officer.firstName, entry.officer.lastName)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Link href={`/officers/${entry.officer.id}`} className="text-[13px] font-medium text-white hover:text-[#d4af37] transition-colors">
                                                {entry.officer.firstName} {entry.officer.lastName}
                                            </Link>
                                            <span className="text-[11px] text-[#8ea4bd]">#{displayBadgeNumber(entry.officer.badgeNumber)}</span>
                                            {entry.newBadgeNumber && (
                                                <span className="text-[10.5px] text-[#8ea4bd]">
                          → <span className="text-[#d4af37]">#{displayBadgeNumber(entry.newBadgeNumber)}</span>
                        </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                            <RankPill name={entry.currentRank.name} color={entry.currentRank.color} />
                                            <ArrowRight size={11} className="text-[#536b86]" />
                                            <RankPill name={entry.proposedRank.name} color={entry.proposedRank.color} />
                                        </div>
                                        {entry.note && (
                                            <p className="text-[11px] text-[#b7c5d8] mt-1.5 italic">"{entry.note}"</p>
                                        )}
                                        <p className="text-[10.5px] text-[#536b86] mt-1">
                                            Eingereicht von <span className="text-[#7e93ab]">{entry.createdBy?.displayName ?? list.createdBy?.displayName ?? 'Gelöscht'}</span>
                                            {entry.executed && entry.executedAt && <> · Durchgeführt am {formatDate(entry.executedAt)}</>}
                                        </p>
                                    </div>
                                    {entry.executed ? (
                                        <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#34d399] bg-[#34d399]/12 px-2 py-1 rounded-[6px]">
                        ✓ Durchgeführt
                      </span>
                                            {canExecute && onUndo && (
                                                <Button variant="secondary" size="sm" onClick={() => onUndo(entry)}>
                                                    <Undo2 size={12} /> Rückgängig
                                                </Button>
                                            )}
                                        </div>
                                    ) : isDraft && canExecute ? (
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button size="sm" variant={variant === 'demotion' ? 'danger' : 'primary'} onClick={() => onExecute(entry)}>
                                                <Play size={12} /> Durchführen
                                            </Button>
                                            <button
                                                onClick={() => onRemove(entry.id)}
                                                className="p-1.5 rounded-[6px] hover:bg-[#321218]/60 text-[#536b86] hover:text-[#fca5a5] transition-colors"
                                                title="Entfernen"
                                            >
                                                <X size={13} />
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[12px] text-[#536b86] italic py-3">{emptyText}</p>
                    )}

                    {((isDraft && canManage) || canDelete) && (
                        <div className="flex gap-1.5 pt-1">
                            {isDraft && canManage && (
                                <Button variant="secondary" size="sm" onClick={onAddEntry}>
                                    {addLabel}
                                </Button>
                            )}
                            {canDelete && (
                                <Button variant="danger" size="sm" onClick={onDelete}>
                                    Liste löschen
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}