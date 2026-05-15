'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Clock3, Plus, RefreshCw, Save, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { PageLoader } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { useAuth } from '@/context/auth-context'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { hasPermission } from '@/lib/permissions'
import { cn, formatDateTime } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'

interface PatrolOfficer {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  rank: { id?: string; name: string; color: string; sortOrder: number }
  isRookie: boolean
  activeSince?: string | null
  playerName?: string | null
}

interface PatrolMember {
  id: string
  officerId: string
  sortOrder: number
  officer: PatrolOfficer
}

interface PatrolUnit {
  id: string
  name: string
  callSign: string | null
  assignment: string | null
  notes: string | null
  sortOrder: number
  members: PatrolMember[]
}

interface PatrolBoard {
  id: string
  title: string
  startsAt: string
  createdAt: string
  updatedAt: string
  createdBy: { displayName: string } | null
  patrols: PatrolUnit[]
}

interface PatrolBoardResponse {
  activeBoard: PatrolBoard | null
  boards: PatrolBoard[]
  activeDutyOfficers: PatrolOfficer[]
  syncedAt: string
}

interface PatrolDraft {
  localId: string
  name: string
  callSign: string
  assignment: string
  notes: string
  members: PatrolOfficer[]
}

interface BoardDraft {
  id: string
  title: string
  startsAt: string
  patrols: PatrolDraft[]
}

function officerName(officer: Pick<PatrolOfficer, 'firstName' | 'lastName'>) {
  return `${officer.firstName} ${officer.lastName}`
}

function officerLabel(officer: PatrolOfficer) {
  return `${displayBadgeNumber(officer.badgeNumber)} · ${officerName(officer)}`
}

function toDraft(board: PatrolBoard): BoardDraft {
  return {
    id: board.id,
    title: board.title,
    startsAt: board.startsAt,
    patrols: board.patrols.map((patrol) => ({
      localId: patrol.id,
      name: patrol.name,
      callSign: patrol.callSign ?? '',
      assignment: patrol.assignment ?? '',
      notes: patrol.notes ?? '',
      members: patrol.members.map((member) => member.officer),
    })),
  }
}

function toDateTimeLocal(value: string | Date) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function emptyCreateDateTime() {
  return toDateTimeLocal(new Date())
}

function validateDraft(draft: BoardDraft | null) {
  if (!draft) return { hard: [] as string[], warnings: [] as string[] }
  const hard: string[] = []
  const warnings: string[] = []

  for (const patrol of draft.patrols) {
    if (patrol.members.length > 3) hard.push(`${patrol.name}: mehr als 3 Mitglieder`)
    if (patrol.members.length === 1) warnings.push(`${patrol.name}: ein Officer alleine`)
    if (patrol.members.filter((officer) => officer.isRookie).length >= 2) {
      warnings.push(`${patrol.name}: mehrere Rookies zusammen`)
    }
  }

  return { hard, warnings }
}

export default function PatrolBoardPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'patrol-board:view')
  const canManage = hasPermission(user, 'patrol-board:manage')
  const { data, loading, error: loadError, refetch } = useFetch<PatrolBoardResponse>(canView ? '/api/patrol-boards' : null)
  const { execute, loading: saving } = useApi<PatrolBoard>()
  const { addToast } = useToast()

  const [selectedBoardId, setSelectedBoardId] = useState('')
  const [draft, setDraft] = useState<BoardDraft | null>(null)
  const [selectedOfficerId, setSelectedOfficerId] = useState('')
  const [createModal, setCreateModal] = useState(false)
  const [confirmModal, setConfirmModal] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', startsAt: emptyCreateDateTime() })

  const selectedBoard = useMemo(() => {
    if (!data) return null
    return data.boards.find((board) => board.id === selectedBoardId) ?? data.activeBoard
  }, [data, selectedBoardId])

  useEffect(() => {
    if (!data?.activeBoard) return
    setSelectedBoardId((current) => current || data.activeBoard?.id || '')
  }, [data?.activeBoard])

  useEffect(() => {
    if (!selectedBoard) {
      setDraft(null)
      return
    }
    setDraft(toDraft(selectedBoard))
    setSelectedOfficerId('')
  }, [selectedBoard])

  const assignedOfficerIds = useMemo(() => {
    const ids = new Set<string>()
    draft?.patrols.forEach((patrol) => patrol.members.forEach((officer) => ids.add(officer.id)))
    return ids
  }, [draft])

  const activeOfficers = data?.activeDutyOfficers ?? []
  const selectedOfficer = activeOfficers.find((officer) => officer.id === selectedOfficerId) ?? null
  const unassignedActiveOfficers = activeOfficers.filter((officer) => !assignedOfficerIds.has(officer.id))
  const assignedActiveCount = activeOfficers.length - unassignedActiveOfficers.length
  const draftValidation = validateDraft(draft)

  const updateDraft = (updater: (current: BoardDraft) => BoardDraft) => {
    setDraft((current) => current ? updater(current) : current)
  }

  const updatePatrol = (localId: string, patch: Partial<PatrolDraft>) => {
    updateDraft((current) => ({
      ...current,
      patrols: current.patrols.map((patrol) => patrol.localId === localId ? { ...patrol, ...patch } : patrol),
    }))
  }

  const addPatrol = () => {
    updateDraft((current) => {
      const nextNumber = current.patrols.length + 1
      return {
        ...current,
        patrols: [
          ...current.patrols,
          {
            localId: `local-${Date.now()}`,
            name: `Streife ${nextNumber}`,
            callSign: `S-${nextNumber}`,
            assignment: '',
            notes: '',
            members: [],
          },
        ],
      }
    })
  }

  const removePatrol = (localId: string) => {
    updateDraft((current) => ({
      ...current,
      patrols: current.patrols.filter((patrol) => patrol.localId !== localId),
    }))
  }

  const addSelectedOfficer = (patrolId: string) => {
    if (!selectedOfficer) return
    updateDraft((current) => ({
      ...current,
      patrols: current.patrols.map((patrol) => {
        if (patrol.localId !== patrolId) {
          return {
            ...patrol,
            members: patrol.members.filter((member) => member.id !== selectedOfficer.id),
          }
        }
        if (patrol.members.some((member) => member.id === selectedOfficer.id) || patrol.members.length >= 3) return patrol
        return { ...patrol, members: [...patrol.members, selectedOfficer] }
      }),
    }))
    setSelectedOfficerId('')
  }

  const removeMember = (patrolId: string, officerId: string) => {
    updateDraft((current) => ({
      ...current,
      patrols: current.patrols.map((patrol) => (
        patrol.localId === patrolId
          ? { ...patrol, members: patrol.members.filter((member) => member.id !== officerId) }
          : patrol
      )),
    }))
  }

  const saveDraft = async (confirmRuleViolations = false) => {
    if (!draft) return
    const startsAt = new Date(draft.startsAt)
    if (Number.isNaN(startsAt.getTime())) {
      addToast({ type: 'error', title: 'Ungültiges Datum' })
      return
    }
    const validation = validateDraft(draft)
    if (validation.hard.length > 0) {
      addToast({ type: 'error', title: 'Streifenregel verletzt', message: validation.hard.join(', ') })
      return
    }
    if (validation.warnings.length > 0 && !confirmRuleViolations) {
      setConfirmModal(true)
      return
    }

    try {
      const updated = await execute(`/api/patrol-boards/${draft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft.title,
          startsAt: startsAt.toISOString(),
          confirmRuleViolations,
          patrols: draft.patrols.map((patrol) => ({
            name: patrol.name,
            callSign: patrol.callSign,
            assignment: patrol.assignment,
            notes: patrol.notes,
            memberIds: patrol.members.map((member) => member.id),
          })),
        }),
      })
      addToast({ type: 'success', title: 'Streifenliste gespeichert' })
      setConfirmModal(false)
      if (updated) setSelectedBoardId(updated.id)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : 'Speichern fehlgeschlagen' })
    }
  }

  const createBoard = async () => {
    const startsAt = new Date(createForm.startsAt)
    if (Number.isNaN(startsAt.getTime())) {
      addToast({ type: 'error', title: 'Ungültiges Datum' })
      return
    }
    try {
      const created = await execute('/api/patrol-boards', {
        method: 'POST',
        body: JSON.stringify({
          title: createForm.title,
          startsAt: startsAt.toISOString(),
        }),
      })
      addToast({ type: 'success', title: 'Streifenliste erstellt' })
      setCreateModal(false)
      setCreateForm({ title: '', startsAt: emptyCreateDateTime() })
      if (created) setSelectedBoardId(created.id)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : 'Erstellen fehlgeschlagen' })
    }
  }

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />

  if (loadError) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Streifenboard" description="Aktive Einteilungen und Einsatznotizen" />
        <div className="glass-panel-elevated rounded-[14px] p-8 text-center">
          <AlertTriangle size={26} className="mx-auto text-[#f87171] mb-3" />
          <p className="text-[13px] text-[#9fb0c4] mb-4">{loadError}</p>
          <Button size="sm" onClick={refetch}><RefreshCw size={13} /> Erneut laden</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="Streifenboard"
        description={draft ? `${draft.patrols.length} Streifen · ${assignedActiveCount}/${activeOfficers.length} im Dienst eingeteilt` : 'Aktive Einteilungen und Einsatznotizen'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RefreshCw size={13} /> Aktualisieren
            </Button>
            {canManage && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setCreateModal(true)}>
                  <Plus size={13} /> Neue Liste
                </Button>
                <Button size="sm" onClick={() => saveDraft()} loading={saving} disabled={!draft}>
                  <Save size={13} /> Speichern
                </Button>
              </>
            )}
          </div>
        }
      />

      {data && data.boards.length > 0 && (
        <div className="glass-panel-elevated rounded-[14px] p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px] lg:items-end">
            <Select
              label="Streifenliste"
              value={selectedBoard?.id ?? ''}
              onValueChange={setSelectedBoardId}
              options={data.boards.map((board, index) => ({
                value: board.id,
                label: `${board.title}${index === 0 ? ' · Aktiv' : ''}`,
              }))}
            />
            <Input
              label="Datum und Uhrzeit"
              type="datetime-local"
              value={draft ? toDateTimeLocal(draft.startsAt) : ''}
              disabled={!canManage || !draft}
              onChange={(event) => updateDraft((current) => ({ ...current, startsAt: new Date(event.target.value).toISOString() }))}
            />
            <Input
              label="Titel"
              value={draft?.title ?? ''}
              disabled={!canManage || !draft}
              onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </div>
        </div>
      )}

      {!draft ? (
        <div className="glass-panel-elevated rounded-[14px] p-10 text-center">
          <ShieldCheck size={28} className="mx-auto text-[#d4af37]/50 mb-3" />
          <p className="text-[13px] text-[#8ea4bd]">Noch keine Streifenliste vorhanden</p>
          {canManage && (
            <Button className="mt-4" size="sm" onClick={() => setCreateModal(true)}>
              <Plus size={13} /> Erste Liste erstellen
            </Button>
          )}
        </div>
      ) : (
        <>
          {(draftValidation.hard.length > 0 || draftValidation.warnings.length > 0) && (
            <div className={cn(
              'rounded-[12px] border px-4 py-3 text-[12.5px]',
              draftValidation.hard.length > 0
                ? 'border-[#3b1616] bg-[#1c1111]/80 text-[#fca5a5]'
                : 'border-[#3d2d12] bg-[#1d1608]/80 text-[#e8c979]',
            )}>
              {[...draftValidation.hard, ...draftValidation.warnings].join(' · ')}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
            <section className="glass-panel-elevated rounded-[14px] p-4 xl:sticky xl:top-5 xl:self-start">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[13.5px] font-semibold text-[#f7fbff]">Im Dienst</h3>
                  <p className="text-[12px] text-[#7089a5] mt-1">Sync {formatDateTime(data?.syncedAt)}</p>
                </div>
                <span className="rounded-full border border-[#234568]/60 bg-[#0a1a33]/70 px-2.5 py-1 text-[11px] text-[#9fb0c4]">
                  {unassignedActiveOfficers.length} frei
                </span>
              </div>

              {activeOfficers.length > 0 ? (
                <div className="space-y-2">
                  {activeOfficers.map((officer) => {
                    const assigned = assignedOfficerIds.has(officer.id)
                    const selected = selectedOfficerId === officer.id
                    return (
                      <button
                        key={officer.id}
                        type="button"
                        disabled={!canManage}
                        onClick={() => setSelectedOfficerId(selected ? '' : officer.id)}
                        className={cn(
                          'w-full rounded-[10px] border px-3 py-2.5 text-left transition-colors',
                          selected
                            ? 'border-[#d4af37]/70 bg-[#1d2b22]/80'
                            : assigned
                              ? 'border-[#1f3d5f]/45 bg-[#071a31]/45 opacity-65'
                              : 'border-[#1e3a5c]/55 bg-[#0a1e38]/70 hover:border-[#d4af37]/30',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-white">{officerLabel(officer)}</p>
                            <p className="mt-0.5 truncate text-[11.5px] text-[#8ea4bd]">
                              {officer.rank.name}{officer.playerName ? ` · ${officer.playerName}` : ''}
                            </p>
                          </div>
                          {officer.isRookie && <span className="rounded-full bg-[#2a2f3a] px-2 py-0.5 text-[10.5px] text-[#d7dde6]">Rookie</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-[10px] border border-[#1e3a5c]/40 bg-[#0a1e38]/50 px-4 py-10 text-center">
                  <Users size={24} className="mx-auto text-[#d4af37]/35 mb-2" />
                  <p className="text-[13px] text-[#8ea4bd]">Kein PDler im Dienst</p>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#8ea4bd]">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#234568]/60 bg-[#0a1a33]/70 px-2.5 py-1">
                    <Clock3 size={12} /> {formatDateTime(draft.startsAt)}
                  </span>
                  {selectedOfficer && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/30 bg-[#2a2412]/70 px-2.5 py-1 text-[#e8c979]">
                      <UserPlus size={12} /> {officerLabel(selectedOfficer)}
                    </span>
                  )}
                </div>
                {canManage && (
                  <Button variant="secondary" size="sm" onClick={addPatrol}>
                    <Plus size={13} /> Streife
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {draft.patrols.map((patrol, index) => {
                  const rookies = patrol.members.filter((officer) => officer.isRookie).length
                  const hasWarning = patrol.members.length === 1 || rookies >= 2
                  return (
                    <motion.div
                      key={patrol.localId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                      className={cn(
                        'glass-panel-elevated rounded-[14px] p-4',
                        hasWarning && 'ring-1 ring-[#fbbf24]/25',
                      )}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_86px] gap-2">
                          <Input
                            value={patrol.name}
                            disabled={!canManage}
                            onChange={(event) => updatePatrol(patrol.localId, { name: event.target.value })}
                            className="font-semibold"
                            aria-label="Streifenname"
                          />
                          <Input
                            value={patrol.callSign}
                            disabled={!canManage}
                            onChange={(event) => updatePatrol(patrol.localId, { callSign: event.target.value })}
                            aria-label="Funkruf"
                          />
                        </div>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => removePatrol(patrol.localId)}
                            className="mt-1 rounded-[8px] p-1.5 text-[#6b8299] transition-colors hover:bg-[#1c1111] hover:text-[#f87171]"
                            title="Streife löschen"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <Input
                          label="Einsatz"
                          value={patrol.assignment}
                          disabled={!canManage}
                          placeholder="z. B. Patrol, Bank, Einsatzleitung"
                          onChange={(event) => updatePatrol(patrol.localId, { assignment: event.target.value })}
                        />
                        <Textarea
                          label="Notizen"
                          value={patrol.notes}
                          disabled={!canManage}
                          rows={3}
                          placeholder="Kurze Einsatznotiz"
                          onChange={(event) => updatePatrol(patrol.localId, { notes: event.target.value })}
                        />

                        <div className="rounded-[10px] border border-[#1e3a5c]/45 bg-[#061426]/45 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[12px] font-medium text-[#9fb0c4]">Besatzung</p>
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-[10.5px]',
                              patrol.members.length > 3
                                ? 'bg-[#3a1515] text-[#fca5a5]'
                                : patrol.members.length === 0
                                  ? 'bg-[#0a1a33] text-[#5f7691]'
                                  : 'bg-[#102542] text-[#c7d4e4]',
                            )}>
                              {patrol.members.length}/3
                            </span>
                          </div>

                          <div className="space-y-2">
                            {patrol.members.map((member) => (
                              <div key={member.id} className="flex items-center justify-between gap-2 rounded-[8px] bg-[#0a1e38]/70 px-2.5 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-[12.5px] font-medium text-white">{officerLabel(member)}</p>
                                  <p className="truncate text-[11px] text-[#7089a5]">{member.rank.name}</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {member.isRookie && <span className="rounded-full bg-[#2a2f3a] px-2 py-0.5 text-[10px] text-[#d7dde6]">Rookie</span>}
                                  {canManage && (
                                    <button
                                      type="button"
                                      onClick={() => removeMember(patrol.localId, member.id)}
                                      className="rounded-[7px] p-1 text-[#6b8299] transition-colors hover:bg-[#102542] hover:text-white"
                                      title="Entfernen"
                                    >
                                      <X size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {patrol.members.length === 0 && (
                              <p className="py-4 text-center text-[12px] text-[#5f7691]">Keine Besatzung</p>
                            )}
                          </div>

                          {canManage && (
                            <Button
                              className="mt-3 w-full"
                              variant="outline"
                              size="sm"
                              onClick={() => addSelectedOfficer(patrol.localId)}
                              disabled={!selectedOfficer || patrol.members.length >= 3}
                            >
                              <UserPlus size={13} /> Ausgewählten hinzufügen
                            </Button>
                          )}
                        </div>

                        {hasWarning && (
                          <div className="flex items-start gap-2 rounded-[9px] border border-[#3d2d12] bg-[#1d1608]/70 px-3 py-2 text-[11.5px] text-[#e8c979]">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            <span>{patrol.members.length === 1 ? 'Solo-Streife' : 'Rookie/Rookie-Konstellation'}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </section>
          </div>
        </>
      )}

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Neue Streifenliste">
        <div className="space-y-4">
          <Input label="Titel" value={createForm.title} onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })} placeholder="Automatisch, wenn leer" />
          <Input label="Datum und Uhrzeit" type="datetime-local" value={createForm.startsAt} onChange={(event) => setCreateForm({ ...createForm, startsAt: event.target.value })} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setCreateModal(false)}>Abbrechen</Button>
            <Button size="sm" onClick={createBoard} loading={saving}><Plus size={13} /> Erstellen</Button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="Ausnahme bestätigen">
        <div className="space-y-4">
          <div className="rounded-[10px] border border-[#3d2d12] bg-[#1d1608]/80 px-4 py-3 text-[12.5px] text-[#e8c979]">
            {draftValidation.warnings.join(' · ')}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setConfirmModal(false)}>Abbrechen</Button>
            <Button size="sm" onClick={() => saveDraft(true)} loading={saving}><Save size={13} /> Trotzdem speichern</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
