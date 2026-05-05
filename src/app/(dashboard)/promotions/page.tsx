'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Plus, Trash2, Play, FileText, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { formatDate, cn } from '@/lib/utils'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { displayBadgeNumber } from '@/lib/badge-number'

interface Rank { id: string; name: string; sortOrder: number; color: string }
interface Officer {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  rank: Rank
  rankId: string
  status: string
}

interface ListEntry {
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

interface RankChangeList {
  id: string
  name: string
  description: string | null
  type: string
  status: string
  createdBy: { displayName: string }
  createdAt: string
  entries: ListEntry[]
}

export default function PromotionsPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'rank-changes:view')
  const canManage = hasPermission(user, 'rank-changes:manage')
  const canExecute = hasPermission(user, 'rank-change-lists:execute')
  const canDeleteLists = hasPermission(user, 'rank-change-lists:delete')
  const { data: lists, loading, refetch } = useFetch<RankChangeList[]>(canView ? '/api/rank-change-lists?type=PROMOTION' : null)
  const { data: officers } = useFetch<Officer[]>(canManage ? '/api/officers' : null)
  const { data: ranks } = useFetch<Rank[]>(canManage ? '/api/ranks' : null)
  const { execute } = useApi()
  const { addToast } = useToast()

  const [createModal, setCreateModal] = useState(false)
  const [addEntryListId, setAddEntryListId] = useState<string | null>(null)
  const [executeEntry, setExecuteEntry] = useState<{ listId: string; entryId: string; name: string } | null>(null)
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set())

  const [listForm, setListForm] = useState({ name: '', description: '' })
  const [entryForm, setEntryForm] = useState({ officerId: '', proposedRankId: '', newBadgeNumber: '', note: '' })
  const [officerSearch, setOfficerSearch] = useState('')

  const activeOfficers = officers?.filter(o => o.status !== 'TERMINATED') || []
  const filteredOfficers = activeOfficers.filter((officer) => {
    const query = officerSearch.trim().toLowerCase()
    if (!query) return true
    return (
      officer.badgeNumber.toLowerCase().includes(query) ||
      officer.firstName.toLowerCase().includes(query) ||
      officer.lastName.toLowerCase().includes(query) ||
      officer.rank.name.toLowerCase().includes(query)
    )
  })
  const selectedOfficer = activeOfficers.find(o => o.id === entryForm.officerId)

  const getHigherRanks = () => {
    if (!selectedOfficer || !ranks) return []
    return ranks.filter(r => r.sortOrder < selectedOfficer.rank.sortOrder)
  }

  const toggleExpand = (id: string) => {
    setExpandedLists(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateList = async () => {
    if (!listForm.name.trim()) return
    try {
      const result = await execute('/api/rank-change-lists', {
        method: 'POST',
        body: JSON.stringify({ ...listForm, type: 'PROMOTION' }),
      })
      addToast({ type: 'success', title: 'Liste erstellt' })
      setCreateModal(false)
      setListForm({ name: '', description: '' })
      const created = result as { id: string } | null
      if (created) setExpandedLists(prev => new Set([...prev, created.id]))
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleDeleteList = async (id: string) => {
    try {
      await execute(`/api/rank-change-lists/${id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Liste gelöscht' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleAddEntry = async () => {
    if (!addEntryListId || !entryForm.officerId || !entryForm.proposedRankId) return
    try {
      await execute(`/api/rank-change-lists/${addEntryListId}/entries`, {
        method: 'POST',
        body: JSON.stringify(entryForm),
      })
      addToast({ type: 'success', title: 'Officer hinzugefügt' })
      setAddEntryListId(null)
      setEntryForm({ officerId: '', proposedRankId: '', newBadgeNumber: '', note: '' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleRemoveEntry = async (listId: string, entryId: string) => {
    try {
      await execute(`/api/rank-change-lists/${listId}/entries`, {
        method: 'DELETE',
        body: JSON.stringify({ entryId }),
      })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleExecuteEntry = async () => {
    if (!executeEntry) return
    try {
      const result = await execute(`/api/rank-change-lists/${executeEntry.listId}/execute`, {
        method: 'POST',
        body: JSON.stringify({ entryId: executeEntry.entryId }),
      }) as { executed: number } | null
      addToast({ type: 'success', title: `${result?.executed ?? 0} Beförderung durchgeführt` })
      setExecuteEntry(null)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Beförderungen"
        description={`${lists?.length || 0} Listen`}
        action={canManage ? (
          <Button size="sm" onClick={() => { setListForm({ name: '', description: '' }); setCreateModal(true) }}>
            <Plus size={14} strokeWidth={2} />
            Neue Liste
          </Button>
        ) : undefined}
      />

      {(!lists || lists.length === 0) && (
        <div className="text-center py-20">
          <FileText size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
          <p className="text-[13px] text-[#999] mb-3">Noch keine Beförderungslisten</p>
          {canManage && <Button size="sm" variant="secondary" onClick={() => { setListForm({ name: '', description: '' }); setCreateModal(true) }}>
            <Plus size={13} /> Erste Liste erstellen
          </Button>}
        </div>
      )}

      <div className="space-y-3">
        {lists?.map((list, i) => {
          const isExpanded = expandedLists.has(list.id)
          const pendingCount = list.entries.filter(e => !e.executed).length
          const isDraft = list.status === 'DRAFT'

          return (
            <motion.div
              key={list.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass-panel-elevated rounded-[14px] overflow-hidden"
            >
              <button
                onClick={() => toggleExpand(list.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#0f2340] transition-colors text-left"
              >
                <ChevronDown size={14} strokeWidth={2} className={cn('text-[#4a6585] transition-transform duration-200', !isExpanded && '-rotate-90')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-[#eee]">{list.name}</span>
                    <span className={cn('text-[11px] px-1.5 py-[1px] rounded-[4px] font-medium',
                      isDraft ? 'bg-[#1c1a11] text-[#fbbf24]' : 'bg-[#0d1f17] text-[#34d399]'
                    )}>
                      {isDraft ? 'Entwurf' : 'Abgeschlossen'}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[#999] mt-0.5">
                    {list.entries.length} Einträge · {formatDate(list.createdAt)} · {list.createdBy.displayName}
                    {list.description && <span> · {list.description}</span>}
                  </p>
                </div>
                {isDraft && pendingCount > 0 && (
                  <span className="text-[12px] text-[#888] bg-[#0f2340] px-2 py-0.5 rounded-[5px]">
                    {pendingCount} offen
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="px-5 pb-4">
                  {list.entries.length > 0 ? (
                    <div className="space-y-1.5 mb-3">
                      {list.entries.map((entry) => (
                        <div key={entry.id} className="flex items-center gap-3 px-3 py-2 bg-[#0f2340] rounded-[8px]">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-[#eee]">
                              <Link href={`/officers/${entry.officer.id}`} className="text-inherit hover:underline">
                                {entry.officer.firstName} {entry.officer.lastName}
                              </Link>
                                <span className="text-[#bbb] font-normal ml-1">({displayBadgeNumber(entry.officer.badgeNumber)})</span>
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[11.5px] text-[#888]">{entry.currentRank.name}</span>
                              <ArrowRight size={10} className="text-[#ccc]" />
                              <span className="text-[11.5px] text-[#eee] font-medium">{entry.proposedRank.name}</span>
                              {entry.note && <span className="text-[11px] text-[#bbb] ml-1">· {entry.note}</span>}
                            </div>
                            <p className="text-[11px] text-[#7089a5] mt-0.5">
                              Eingereicht von <span className="text-[#9fb0c4]">{entry.createdBy?.displayName ?? list.createdBy.displayName}</span>
                              {entry.executed && entry.executedAt && (
                                <> · Durchgeführt am {formatDate(entry.executedAt)}</>
                              )}
                            </p>
                          </div>
                          {entry.executed ? (
                            <span className="text-[11px] text-[#34d399] font-medium shrink-0">Durchgeführt</span>
                           ) : isDraft && canExecute ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" onClick={() => setExecuteEntry({
                                listId: list.id,
                                entryId: entry.id,
                                name: `${entry.officer.firstName} ${entry.officer.lastName}`,
                              })}>
                                <Play size={13} /> Durchführen
                              </Button>
                              <button onClick={() => handleRemoveEntry(list.id, entry.id)}
                                className="p-1 rounded-[5px] hover:bg-[#142d52] transition-colors">
                                <X size={13} className="text-[#4a6585]" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-[#4a6585] mb-3 px-1">Noch keine Officers in dieser Liste</p>
                  )}

                  {((isDraft && canManage) || canDeleteLists) && (
                    <div className="flex gap-1.5">
                      {isDraft && canManage && (
                        <Button variant="secondary" size="sm" onClick={() => {
                          setEntryForm({ officerId: '', proposedRankId: '', newBadgeNumber: '', note: '' })
                          setOfficerSearch('')
                          setAddEntryListId(list.id)
                        }}>
                          <Plus size={13} /> Officer hinzufügen
                        </Button>
                      )}
                      {canDeleteLists && (
                        <Button variant="danger" size="sm" onClick={() => handleDeleteList(list.id)}>
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Create list modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Neue Beförderungsliste" size="sm">
        <div className="space-y-4">
          <Input label="Name" value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} required placeholder="z.B. Beförderungen April 2026" />
          <Textarea label="Beschreibung (optional)" value={listForm.description} onChange={(e) => setListForm({ ...listForm, description: e.target.value })} rows={2} placeholder="Optional" />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setCreateModal(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleCreateList} disabled={!listForm.name.trim()}>Erstellen</Button>
          </div>
        </div>
      </Modal>

      {/* Add entry modal */}
      <Modal open={!!addEntryListId} onClose={() => setAddEntryListId(null)} title="Officer hinzufügen" size="md">
        <div className="space-y-4">
          <Input
            label="Officer suchen"
            value={officerSearch}
            onChange={(e) => setOfficerSearch(e.target.value)}
            placeholder="Name, DN oder Rang..."
          />
          <Select
            label="Officer auswählen"
            value={entryForm.officerId}
            onChange={(e) => { setEntryForm({ ...entryForm, officerId: e.target.value, proposedRankId: '' }) }}
            options={filteredOfficers.map(o => ({ value: o.id, label: `${displayBadgeNumber(o.badgeNumber)} – ${o.firstName} ${o.lastName} (${o.rank.name})` }))}
            placeholder={filteredOfficers.length > 0 ? 'Officer wählen...' : 'Keine Treffer'}
            disabled={filteredOfficers.length === 0}
          />
          {selectedOfficer && (
            <>
              <div className="px-3 py-2.5 bg-[#0f2340] rounded-[8px]">
                <p className="text-[13px] text-[#888]">Aktueller Rang: <strong className="text-[#eee]">{selectedOfficer.rank.name}</strong></p>
              </div>
              <Select
                label="Neuer Rang (höher)"
                value={entryForm.proposedRankId}
                onChange={(e) => setEntryForm({ ...entryForm, proposedRankId: e.target.value })}
                options={getHigherRanks().map(r => ({ value: r.id, label: r.name }))}
                placeholder="Rang wählen..."
              />
              <Input label="Neue DN (optional)" value={entryForm.newBadgeNumber} onChange={(e) => setEntryForm({ ...entryForm, newBadgeNumber: e.target.value })} placeholder={`Aktuell: ${displayBadgeNumber(selectedOfficer.badgeNumber)}`} />
              <Input label="Notiz (optional)" value={entryForm.note} onChange={(e) => setEntryForm({ ...entryForm, note: e.target.value })} placeholder="Optional" />
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setAddEntryListId(null)}>Abbrechen</Button>
            <Button size="sm" onClick={handleAddEntry} disabled={!entryForm.officerId || !entryForm.proposedRankId}>Hinzufügen</Button>
          </div>
        </div>
      </Modal>

      {/* Execute confirmation */}
      <Modal open={!!executeEntry} onClose={() => setExecuteEntry(null)} title="Beförderung ausführen">
        <p className="text-[13px] text-[#888] mb-5">
          Die Beförderung für {executeEntry?.name} wird jetzt durchgeführt. Rang und Dienstnummer werden sofort geändert. Fortfahren?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setExecuteEntry(null)}>Abbrechen</Button>
          <Button size="sm" onClick={handleExecuteEntry}>Durchführen</Button>
        </div>
      </Modal>
    </div>
  )
}
