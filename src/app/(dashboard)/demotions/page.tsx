'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, TrendingDown } from 'lucide-react'
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
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { displayBadgeNumber } from '@/lib/badge-number'
import { RankChangeListCard } from '@/components/rank-changes/rank-change-list-card'

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
  createdBy: { displayName: string } | null
  createdAt: string
  entries: ListEntry[]
}

export default function DemotionsPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'rank-changes:view')
  const canManage = hasPermission(user, 'rank-changes:manage')
  const canExecute = hasPermission(user, 'rank-change-lists:execute')
  const canDeleteLists = hasPermission(user, 'rank-change-lists:delete')
  const { data: lists, loading, refetch } = useFetch<RankChangeList[]>(canView ? '/api/rank-change-lists?type=DEMOTION' : null)
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

  const getLowerRanks = () => {
    if (!selectedOfficer || !ranks) return []
    return ranks.filter(r => r.sortOrder > selectedOfficer.rank.sortOrder)
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
        body: JSON.stringify({ ...listForm, type: 'DEMOTION' }),
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
      addToast({ type: 'success', title: `${result?.executed ?? 0} Degradierung durchgeführt` })
      setExecuteEntry(null)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  const totalEntries = lists?.reduce((sum, l) => sum + l.entries.length, 0) ?? 0
  const executedEntries = lists?.reduce((sum, l) => sum + l.entries.filter((e) => e.executed).length, 0) ?? 0
  const pendingEntries = totalEntries - executedEntries

  return (
      <div>
        <PageHeader
            title="Degradierungen"
            description="Listen für anstehende und durchgeführte Rang-Senkungen verwalten."
            action={canManage ? (
                <Button size="sm" onClick={() => { setListForm({ name: '', description: '' }); setCreateModal(true) }}>
                  <Plus size={14} strokeWidth={2} /> Neue Liste
                </Button>
            ) : undefined}
        />

        {(lists?.length ?? 0) > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="glass-panel-elevated rounded-[12px] border border-[#1e3a5c]/45 p-3.5">
                <p className="text-[10.5px] uppercase tracking-wider text-[#8ea4bd] font-semibold">Listen</p>
                <p className="mt-1 text-[22px] font-bold text-white">{lists?.length ?? 0}</p>
              </div>
              <div className="glass-panel-elevated rounded-[12px] border border-[#1e3a5c]/45 p-3.5">
                <p className="text-[10.5px] uppercase tracking-wider text-[#8ea4bd] font-semibold">Durchgeführt</p>
                <p className="mt-1 text-[22px] font-bold text-[#f87171]">{executedEntries}</p>
              </div>
              <div className="glass-panel-elevated rounded-[12px] border border-[#1e3a5c]/45 p-3.5">
                <p className="text-[10.5px] uppercase tracking-wider text-[#8ea4bd] font-semibold">Offen</p>
                <p className="mt-1 text-[22px] font-bold text-[#fbbf24]">{pendingEntries}</p>
              </div>
            </div>
        )}

        {(!lists || lists.length === 0) && (
            <div className="glass-panel-elevated rounded-[14px] py-16 text-center border border-[#1e3a5c]/45">
              <div className="inline-flex rounded-full bg-[#f87171]/10 p-4 mb-3">
                <TrendingDown size={26} className="text-[#f87171]" />
              </div>
              <p className="text-[14px] font-semibold text-white mb-1">Noch keine Degradierungslisten</p>
              <p className="text-[12.5px] text-[#8ea4bd] mb-4">Erstelle eine Liste, um Degradierungen vorzubereiten.</p>
              {canManage && <Button size="sm" onClick={() => { setListForm({ name: '', description: '' }); setCreateModal(true) }}>
                <Plus size={13} /> Erste Liste erstellen
              </Button>}
            </div>
        )}

        <div className="space-y-3">
          {lists?.map((list, i) => (
              <motion.div
                  key={list.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
              >
                <RankChangeListCard
                    list={list}
                    variant="demotion"
                    expanded={expandedLists.has(list.id)}
                    onToggle={() => toggleExpand(list.id)}
                    canExecute={canExecute}
                    canManage={canManage}
                    canDelete={canDeleteLists}
                    emptyText="Noch keine Officers in dieser Liste"
                    addLabel="+ Officer hinzufügen"
                    onExecute={(entry) => setExecuteEntry({ listId: list.id, entryId: entry.id, name: `${entry.officer.firstName} ${entry.officer.lastName}` })}
                    onRemove={(entryId) => handleRemoveEntry(list.id, entryId)}
                    onAddEntry={() => {
                      setEntryForm({ officerId: '', proposedRankId: '', newBadgeNumber: '', note: '' })
                      setOfficerSearch('')
                      setAddEntryListId(list.id)
                    }}
                    onDelete={() => handleDeleteList(list.id)}
                />
              </motion.div>
          ))}
        </div>


        {/* Create list modal */}
        <Modal open={createModal} onClose={() => setCreateModal(false)} title="Neue Degradierungsliste" size="sm">
          <div className="space-y-4">
            <Input label="Name" value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} required placeholder="z.B. Degradierungen April 2026" />
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
                      label="Neuer Rang (niedriger)"
                      value={entryForm.proposedRankId}
                      onChange={(e) => setEntryForm({ ...entryForm, proposedRankId: e.target.value })}
                      options={getLowerRanks().map(r => ({ value: r.id, label: r.name }))}
                      placeholder="Rang wählen..."
                  />
                  <Input label="Neue DN (optional)" value={entryForm.newBadgeNumber} onChange={(e) => setEntryForm({ ...entryForm, newBadgeNumber: e.target.value })} placeholder={`Aktuell: ${displayBadgeNumber(selectedOfficer.badgeNumber)}`} />
                  <Input label="Grund (optional)" value={entryForm.note} onChange={(e) => setEntryForm({ ...entryForm, note: e.target.value })} placeholder="Grund für Degradierung..." />
                </>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setAddEntryListId(null)}>Abbrechen</Button>
              <Button size="sm" onClick={handleAddEntry} disabled={!entryForm.officerId || !entryForm.proposedRankId}>Hinzufügen</Button>
            </div>
          </div>
        </Modal>

        {/* Execute confirmation */}
        <Modal open={!!executeEntry} onClose={() => setExecuteEntry(null)} title="Degradierung ausführen">
          <p className="text-[13px] text-[#888] mb-5">
            Die Degradierung für {executeEntry?.name} wird jetzt durchgeführt. Rang und Dienstnummer werden sofort geändert. Fortfahren?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setExecuteEntry(null)}>Abbrechen</Button>
            <Button variant="danger" size="sm" onClick={handleExecuteEntry}>Durchführen</Button>
          </div>
        </Modal>
      </div>
  )
}