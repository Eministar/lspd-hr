'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpDown, Plus } from 'lucide-react'
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

type RankChangeType = 'PROMOTION' | 'DEMOTION'

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
  type: RankChangeType | string
  status: string
  createdBy: { displayName: string } | null
  createdAt: string
  entries: ListEntry[]
}

function normalizedType(value: string): RankChangeType {
  return value === 'DEMOTION' ? 'DEMOTION' : 'PROMOTION'
}

function typeLabel(type: RankChangeType) {
  return type === 'DEMOTION' ? 'D-Rank' : 'Up-Rank'
}

function actionLabel(type: RankChangeType) {
  return type === 'DEMOTION' ? 'Degradierung' : 'Beförderung'
}

export default function RankChangeListsPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'rank-changes:view')
  const canManage = hasPermission(user, 'rank-changes:manage')
  const canExecute = hasPermission(user, 'rank-change-lists:execute')
  const canDeleteLists = hasPermission(user, 'rank-change-lists:delete')
  const { data: lists, loading, refetch } = useFetch<RankChangeList[]>(canView ? '/api/rank-change-lists' : null)
  const { data: officers } = useFetch<Officer[]>(canManage ? '/api/officers' : null)
  const { data: ranks } = useFetch<Rank[]>(canManage ? '/api/ranks' : null)
  const { execute } = useApi()
  const { addToast } = useToast()

  const [createModal, setCreateModal] = useState(false)
  const [addEntryListId, setAddEntryListId] = useState<string | null>(null)
  const [executeEntry, setExecuteEntry] = useState<{ listId: string; entryId: string; name: string; type: RankChangeType } | null>(null)
  const [undoEntry, setUndoEntry] = useState<{ listId: string; entryId: string; name: string } | null>(null)
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set())

  const [listForm, setListForm] = useState({ name: '', description: '', type: 'PROMOTION' as RankChangeType })
  const [entryForm, setEntryForm] = useState({ officerId: '', proposedRankId: '', newBadgeNumber: '', note: '' })
  const [officerSearch, setOfficerSearch] = useState('')

  const activeOfficers = officers?.filter((officer) => officer.status !== 'TERMINATED') || []
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
  const selectedOfficer = activeOfficers.find((officer) => officer.id === entryForm.officerId)
  const entryList = lists?.find((list) => list.id === addEntryListId) ?? null
  const entryType = normalizedType(entryList?.type ?? 'PROMOTION')

  const getTargetRanks = () => {
    if (!selectedOfficer || !ranks) return []
    return ranks.filter((rank) => (
      entryType === 'DEMOTION'
        ? rank.sortOrder > selectedOfficer.rank.sortOrder
        : rank.sortOrder < selectedOfficer.rank.sortOrder
    ))
  }

  const openCreateModal = () => {
    setListForm({ name: '', description: '', type: 'PROMOTION' })
    setCreateModal(true)
  }

  const toggleExpand = (id: string) => {
    setExpandedLists((prev) => {
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
        body: JSON.stringify(listForm),
      })
      addToast({ type: 'success', title: 'Liste erstellt' })
      setCreateModal(false)
      setListForm({ name: '', description: '', type: 'PROMOTION' })
      const created = result as { id: string } | null
      if (created) setExpandedLists((prev) => new Set([...prev, created.id]))
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
      addToast({ type: 'success', title: `${result?.executed ?? 0} ${actionLabel(executeEntry.type)} durchgeführt` })
      setExecuteEntry(null)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleUndoEntry = async () => {
    if (!undoEntry) return
    try {
      await execute(`/api/rank-change-lists/${undoEntry.listId}/execute`, {
        method: 'POST',
        body: JSON.stringify({ entryId: undoEntry.entryId, action: 'undo' }),
      })
      addToast({ type: 'success', title: 'Beförderung rückgängig gemacht' })
      setUndoEntry(null)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  const rows = lists ?? []
  const promotionLists = rows.filter((list) => normalizedType(list.type) === 'PROMOTION').length
  const demotionLists = rows.filter((list) => normalizedType(list.type) === 'DEMOTION').length
  const totalEntries = rows.reduce((sum, list) => sum + list.entries.length, 0)
  const executedEntries = rows.reduce((sum, list) => sum + list.entries.filter((entry) => entry.executed).length, 0)
  const pendingEntries = totalEntries - executedEntries

  return (
    <div>
      <PageHeader
        title="Up-/D-Rank-Listen"
        description="Beförderungen und Degradierungen werden ab sofort gemeinsam als Rangänderungslisten geführt."
        action={canManage ? (
          <Button size="sm" onClick={openCreateModal}>
            <Plus size={14} strokeWidth={2} />
            Neue Liste
          </Button>
        ) : undefined}
      />

      {rows.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RankChangeStat label="Up-Rank-Listen" value={promotionLists} tone="text-[#34d399]" />
          <RankChangeStat label="D-Rank-Listen" value={demotionLists} tone="text-[#f87171]" />
          <RankChangeStat label="Durchgeführt" value={executedEntries} tone="text-[#dbe6f3]" />
          <RankChangeStat label="Offen" value={pendingEntries} tone="text-[#fbbf24]" />
        </div>
      )}

      {rows.length === 0 && (
        <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 py-16 text-center">
          <div className="mb-3 inline-flex rounded-full bg-[#d4af37]/10 p-4">
            <ArrowUpDown size={26} className="text-[#d4af37]" />
          </div>
          <p className="mb-1 text-[14px] font-semibold text-white">Noch keine Rangänderungslisten</p>
          <p className="mb-4 text-[12.5px] text-[#8ea4bd]">Erstelle eine Liste für Up-Ranks oder D-Ranks.</p>
          {canManage && (
            <Button size="sm" onClick={openCreateModal}>
              <Plus size={13} />
              Erste Liste erstellen
            </Button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {rows.map((list, index) => {
          const listType = normalizedType(list.type)
          return (
            <motion.div
              key={list.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
            >
              <RankChangeListCard
                list={list}
                variant={listType === 'DEMOTION' ? 'demotion' : 'promotion'}
                expanded={expandedLists.has(list.id)}
                onToggle={() => toggleExpand(list.id)}
                canExecute={canExecute}
                canManage={canManage}
                canDelete={canDeleteLists}
                emptyText={`Noch keine Officers in dieser ${typeLabel(listType)}-Liste`}
                addLabel="+ Officer hinzufügen"
                onExecute={(entry) => setExecuteEntry({ listId: list.id, entryId: entry.id, name: `${entry.officer.firstName} ${entry.officer.lastName}`, type: listType })}
                onUndo={listType === 'PROMOTION' ? (entry) => setUndoEntry({ listId: list.id, entryId: entry.id, name: `${entry.officer.firstName} ${entry.officer.lastName}` }) : undefined}
                onRemove={(entryId) => handleRemoveEntry(list.id, entryId)}
                onAddEntry={() => {
                  setEntryForm({ officerId: '', proposedRankId: '', newBadgeNumber: '', note: '' })
                  setOfficerSearch('')
                  setAddEntryListId(list.id)
                }}
                onDelete={() => handleDeleteList(list.id)}
              />
            </motion.div>
          )
        })}
      </div>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Neue Rangänderungsliste" size="sm">
        <div className="space-y-4">
          <Input
            label="Name"
            value={listForm.name}
            onChange={(event) => setListForm({ ...listForm, name: event.target.value })}
            required
            placeholder="z.B. Rangänderungen Juli 2026"
          />
          <Select
            label="Typ"
            value={listForm.type}
            onValueChange={(value) => setListForm({ ...listForm, type: normalizedType(value) })}
            options={[
              { value: 'PROMOTION', label: 'Up-Rank' },
              { value: 'DEMOTION', label: 'D-Rank' },
            ]}
          />
          <Textarea
            label="Beschreibung (optional)"
            value={listForm.description}
            onChange={(event) => setListForm({ ...listForm, description: event.target.value })}
            rows={2}
            placeholder="Optional"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setCreateModal(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleCreateList} disabled={!listForm.name.trim()}>Erstellen</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!addEntryListId} onClose={() => setAddEntryListId(null)} title={`Officer zur ${typeLabel(entryType)}-Liste hinzufügen`} size="md">
        <div className="space-y-4">
          <Input
            label="Officer suchen"
            value={officerSearch}
            onChange={(event) => setOfficerSearch(event.target.value)}
            placeholder="Name, DN oder Rang..."
          />
          <Select
            label="Officer auswählen"
            value={entryForm.officerId}
            onChange={(event) => setEntryForm({ ...entryForm, officerId: event.target.value, proposedRankId: '' })}
            options={filteredOfficers.map((officer) => ({
              value: officer.id,
              label: `${displayBadgeNumber(officer.badgeNumber)} – ${officer.firstName} ${officer.lastName} (${officer.rank.name})`,
            }))}
            placeholder={filteredOfficers.length > 0 ? 'Officer wählen...' : 'Keine Treffer'}
            disabled={filteredOfficers.length === 0}
          />
          {selectedOfficer && (
            <>
              <div className="rounded-[8px] bg-[#0f2340] px-3 py-2.5">
                <p className="text-[13px] text-[#888]">
                  Aktueller Rang: <strong className="text-[#eee]">{selectedOfficer.rank.name}</strong>
                </p>
              </div>
              <Select
                label={entryType === 'DEMOTION' ? 'Neuer Rang (niedriger)' : 'Neuer Rang (höher)'}
                value={entryForm.proposedRankId}
                onChange={(event) => setEntryForm({ ...entryForm, proposedRankId: event.target.value })}
                options={getTargetRanks().map((rank) => ({ value: rank.id, label: rank.name }))}
                placeholder="Rang wählen..."
              />
              <Input
                label="Neue DN (optional)"
                value={entryForm.newBadgeNumber}
                onChange={(event) => setEntryForm({ ...entryForm, newBadgeNumber: event.target.value })}
                placeholder={`Aktuell: ${displayBadgeNumber(selectedOfficer.badgeNumber)}`}
              />
              <Input
                label={entryType === 'DEMOTION' ? 'Grund (optional)' : 'Notiz (optional)'}
                value={entryForm.note}
                onChange={(event) => setEntryForm({ ...entryForm, note: event.target.value })}
                placeholder={entryType === 'DEMOTION' ? 'Grund für D-Rank...' : 'Optional'}
              />
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setAddEntryListId(null)}>Abbrechen</Button>
            <Button size="sm" onClick={handleAddEntry} disabled={!entryForm.officerId || !entryForm.proposedRankId}>Hinzufügen</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!executeEntry} onClose={() => setExecuteEntry(null)} title={`${executeEntry ? actionLabel(executeEntry.type) : 'Rangänderung'} ausführen`}>
        <p className="mb-5 text-[13px] text-[#888]">
          Die Rangänderung für {executeEntry?.name} wird jetzt durchgeführt. Rang und Dienstnummer werden sofort geändert. Fortfahren?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setExecuteEntry(null)}>Abbrechen</Button>
          <Button size="sm" variant={executeEntry?.type === 'DEMOTION' ? 'danger' : 'primary'} onClick={handleExecuteEntry}>Durchführen</Button>
        </div>
      </Modal>

      <Modal open={!!undoEntry} onClose={() => setUndoEntry(null)} title="Beförderung rückgängig machen">
        <p className="mb-5 text-[13px] text-[#888]">
          Die Beförderung für {undoEntry?.name} wird zurückgesetzt. Rang und Dienstnummer werden auf den Stand vor der Durchführung gesetzt. Fortfahren?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setUndoEntry(null)}>Abbrechen</Button>
          <Button variant="danger" size="sm" onClick={handleUndoEntry}>Rückgängig machen</Button>
        </div>
      </Modal>
    </div>
  )
}

function RankChangeStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="glass-panel-elevated rounded-[12px] border border-[#1e3a5c]/45 p-3.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8ea4bd]">{label}</p>
      <p className={`mt-1 text-[22px] font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}
