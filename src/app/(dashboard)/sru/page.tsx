'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  FileText,
  Folder,
  FolderPlus,
  ListChecks,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'

import { TaskBoard } from '@/components/tasks/task-board'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { cn, formatDateTime } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'

type Tab = 'documents' | 'tasks' | 'calendar'

interface UserLite {
  id: string
  displayName: string
}

interface SruDocument {
  id: string
  folderId: string | null
  title: string
  content: string
  createdAt: string
  updatedAt: string
  createdBy: UserLite | null
  updatedBy: UserLite | null
}

interface SruFolder {
  id: string
  name: string
  description: string | null
  documents: SruDocument[]
}

interface SruDocumentsPayload {
  folders: SruFolder[]
  looseDocuments: SruDocument[]
}

interface Officer {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string
}

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  type: string
  startsAt: string
  endsAt: string | null
  location: string | null
  discordAnnouncement: boolean
  officer: Officer | null
}

const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: 'documents', label: 'Dokumente', icon: FileText },
  { id: 'tasks', label: 'Aufgaben', icon: ListChecks },
  { id: 'calendar', label: 'Kalender', icon: CalendarDays },
]

const sruEventTypes = [
  { value: 'SRU_TRAINING', label: 'SRU-Training' },
  { value: 'SRU_OPERATION', label: 'SRU-Einsatz' },
  { value: 'MEETING', label: 'Besprechung' },
  { value: 'OTHER', label: 'Sonstiges' },
]

function localDateTimeValue(days = 0) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setMinutes(0, 0, 0)
  return date.toISOString().slice(0, 16)
}

function documentPreview(content: string) {
  const firstLine = content.split('\n').find((line) => line.trim())
  return firstLine?.trim() || 'Kein Inhalt'
}

function SruDocuments({ canManage }: { canManage: boolean }) {
  const { data, loading, refetch } = useFetch<SruDocumentsPayload>('/api/sru/folders')
  const { execute } = useApi()
  const { addToast } = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [folderId, setFolderId] = useState('')
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [folderForm, setFolderForm] = useState({ name: '', description: '' })
  const [docForm, setDocForm] = useState({ title: '', folderId: '' })

  const allDocuments = useMemo(() => [
    ...(data?.looseDocuments ?? []),
    ...(data?.folders.flatMap((folder) => folder.documents) ?? []),
  ], [data])

  const selectedDocument = allDocuments.find((document) => document.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedDocument && allDocuments.length > 0) {
      setSelectedId(allDocuments[0].id)
    }
  }, [allDocuments, selectedDocument])

  useEffect(() => {
    if (!selectedDocument) {
      setTitle('')
      setContent('')
      setFolderId('')
      return
    }
    setTitle(selectedDocument.title)
    setContent(selectedDocument.content)
    setFolderId(selectedDocument.folderId ?? '')
  }, [selectedDocument])

  const folderOptions = useMemo(() => [
    { value: '', label: 'Ohne Ordner' },
    ...(data?.folders ?? []).map((folder) => ({ value: folder.id, label: folder.name })),
  ], [data])

  const createFolder = async () => {
    if (!folderForm.name.trim()) return
    try {
      await execute('/api/sru/folders', {
        method: 'POST',
        body: JSON.stringify({
          name: folderForm.name,
          description: folderForm.description || null,
        }),
      })
      addToast({ type: 'success', title: 'Ordner erstellt' })
      setFolderModalOpen(false)
      setFolderForm({ name: '', description: '' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Ordner konnte nicht erstellt werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const deleteFolder = async (id: string) => {
    if (!confirm('Ordner wirklich löschen? Dokumente bleiben ohne Ordner erhalten.')) return
    try {
      await execute(`/api/sru/folders/${id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Ordner gelöscht' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Ordner konnte nicht gelöscht werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const createDocument = async () => {
    if (!docForm.title.trim()) return
    try {
      const created = await execute('/api/sru/documents', {
        method: 'POST',
        body: JSON.stringify({
          title: docForm.title,
          folderId: docForm.folderId || null,
          content: '',
        }),
      }) as SruDocument | null
      addToast({ type: 'success', title: 'Dokument erstellt' })
      setDocModalOpen(false)
      setDocForm({ title: '', folderId: '' })
      await refetch()
      if (created?.id) setSelectedId(created.id)
    } catch (err) {
      addToast({ type: 'error', title: 'Dokument konnte nicht erstellt werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const saveDocument = async () => {
    if (!selectedDocument || !title.trim()) return
    try {
      await execute(`/api/sru/documents/${selectedDocument.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content,
          folderId: folderId || null,
        }),
      })
      addToast({ type: 'success', title: 'Dokument gespeichert' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Dokument konnte nicht gespeichert werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const deleteDocument = async () => {
    if (!selectedDocument || !confirm(`Dokument "${selectedDocument.title}" löschen?`)) return
    try {
      await execute(`/api/sru/documents/${selectedDocument.id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Dokument gelöscht' })
      setSelectedId(null)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Dokument konnte nicht gelöscht werden', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <PageHeader
        title="SRU Dokumente"
        description="Interne Dokumente, Ordner und Einsatznotizen der Special Response Unit"
        action={canManage ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFolderModalOpen(true)}><FolderPlus size={13} /> Ordner</Button>
            <Button size="sm" onClick={() => setDocModalOpen(true)}><Plus size={13} /> Dokument</Button>
          </div>
        ) : undefined}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <aside className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#18385f]/45 flex items-center justify-between">
            <p className="text-[12px] uppercase tracking-[0.14em] font-semibold text-[#8ea4bd]">Ablage</p>
            <button type="button" onClick={refetch} className="p-1.5 rounded-[7px] text-[#6b8299] hover:text-[#d4af37] hover:bg-[#102542]/70">
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-2">
            {(data?.looseDocuments?.length ?? 0) > 0 && (
              <div className="mb-3">
                <p className="px-2 pb-1 text-[11px] text-[#6b8299]">Ohne Ordner</p>
                {data?.looseDocuments.map((document) => (
                  <DocumentButton key={document.id} document={document} active={selectedId === document.id} onClick={() => setSelectedId(document.id)} />
                ))}
              </div>
            )}
            {data?.folders.map((folder) => (
              <div key={folder.id} className="mb-3">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Folder size={13} className="text-[#d4af37]" />
                  <p className="flex-1 truncate text-[12.5px] font-semibold text-[#dbe6f3]">{folder.name}</p>
                  {canManage && (
                    <button type="button" onClick={() => deleteFolder(folder.id)} className="p-1 rounded text-[#536b86] hover:text-red-400">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
                {folder.documents.length === 0 ? (
                  <p className="px-7 py-1 text-[11px] text-[#536b86]">Keine Dokumente</p>
                ) : (
                  folder.documents.map((document) => (
                    <DocumentButton key={document.id} document={document} active={selectedId === document.id} onClick={() => setSelectedId(document.id)} />
                  ))
                )}
              </div>
            ))}
            {allDocuments.length === 0 && (
              <div className="py-12 text-center">
                <FileText size={24} className="mx-auto mb-2 text-[#4a6585]" />
                <p className="text-[12.5px] text-[#8ea4bd]">Keine Dokumente vorhanden</p>
              </div>
            )}
          </div>
        </aside>

        <section className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 overflow-hidden">
          {selectedDocument ? (
            <div className="flex min-h-[680px] flex-col">
              <div className="border-b border-[#18385f]/45 p-4 space-y-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <Input label="Titel" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canManage} required />
                  <div className="md:w-[240px]">
                    <Select label="Ordner" value={folderId} onValueChange={setFolderId} options={folderOptions} disabled={!canManage} />
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveDocument} disabled={!title.trim()}><Save size={13} /> Speichern</Button>
                      <Button variant="danger" size="sm" onClick={deleteDocument}><Trash2 size={13} /> Löschen</Button>
                    </div>
                  )}
                </div>
                <p className="text-[11.5px] text-[#6b8299]">
                  Zuletzt bearbeitet {formatDateTime(selectedDocument.updatedAt)}
                  {selectedDocument.updatedBy ? ` von ${selectedDocument.updatedBy.displayName}` : ''}
                </p>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                readOnly={!canManage}
                className="min-h-[560px] flex-1 resize-none bg-[#061426]/45 p-5 text-[14px] leading-7 text-[#edf4fb] outline-none placeholder:text-[#536b86]"
                placeholder="Dokumentinhalt schreiben..."
              />
            </div>
          ) : (
            <div className="flex min-h-[680px] flex-col items-center justify-center text-center">
              <FileText size={30} className="mb-3 text-[#4a6585]" />
              <p className="text-[13px] text-[#8ea4bd]">Dokument auswählen oder neu erstellen</p>
            </div>
          )}
        </section>
      </div>

      <Modal open={folderModalOpen} onClose={() => setFolderModalOpen(false)} title="SRU-Ordner erstellen">
        <div className="space-y-4">
          <Input label="Name" value={folderForm.name} onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })} required />
          <Textarea label="Beschreibung" value={folderForm.description} onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })} rows={2} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFolderModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={createFolder} disabled={!folderForm.name.trim()}>Erstellen</Button>
          </div>
        </div>
      </Modal>

      <Modal open={docModalOpen} onClose={() => setDocModalOpen(false)} title="SRU-Dokument erstellen">
        <div className="space-y-4">
          <Input label="Titel" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} required />
          <Select label="Ordner" value={docForm.folderId} onValueChange={(nextFolderId) => setDocForm({ ...docForm, folderId: nextFolderId })} options={folderOptions} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDocModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={createDocument} disabled={!docForm.title.trim()}>Erstellen</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function DocumentButton({ document, active, onClick }: { document: SruDocument; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-[10px] px-3 py-2 text-left transition-colors',
        active ? 'bg-[#d4af37]/12 border border-[#d4af37]/30' : 'border border-transparent hover:bg-[#102542]/65',
      )}
    >
      <p className="truncate text-[13px] font-medium text-[#edf4fb]">{document.title}</p>
      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-4 text-[#6b8299]">{documentPreview(document.content)}</p>
    </button>
  )
}

function SruCalendar({ canManage }: { canManage: boolean }) {
  const { data: events, loading, refetch } = useFetch<CalendarEvent[]>('/api/calendar-events?module=SRU')
  const { data: officers } = useFetch<Officer[]>(canManage ? '/api/officers' : null)
  const { execute } = useApi()
  const { addToast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'SRU_TRAINING',
    startsAt: localDateTimeValue(),
    endsAt: '',
    location: '',
    officerId: '',
    discordAnnouncement: false,
  })

  const officerOptions = useMemo(() => [
    { value: '', label: 'Kein Officer-Bezug' },
    ...(officers ?? []).map((officer) => ({
      value: officer.id,
      label: `${officer.firstName} ${officer.lastName} #${displayBadgeNumber(officer.badgeNumber)}`,
    })),
  ], [officers])

  const createEvent = async () => {
    if (!form.title.trim() || !form.startsAt) return
    try {
      await execute('/api/calendar-events', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          module: 'SRU',
          description: form.description.trim() || null,
          endsAt: form.endsAt || null,
          location: form.location.trim() || null,
          officerId: form.officerId || null,
        }),
      })
      addToast({ type: 'success', title: 'SRU-Termin erstellt' })
      setModalOpen(false)
      setForm({ title: '', description: '', type: 'SRU_TRAINING', startsAt: localDateTimeValue(), endsAt: '', location: '', officerId: '', discordAnnouncement: false })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Termin konnte nicht erstellt werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const deleteEvent = async (id: string) => {
    try {
      await execute(`/api/calendar-events/${id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'SRU-Termin gelöscht' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Termin konnte nicht gelöscht werden', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <PageHeader
        title="SRU Kalender"
        description="Termine, Trainings und Einsätze nur für die Special Response Unit"
        action={(
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={refetch}><RefreshCw size={13} /> Aktualisieren</Button>
            {canManage && <Button size="sm" onClick={() => setModalOpen(true)}><Plus size={13} /> Termin</Button>}
          </div>
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {(events ?? []).map((event) => (
          <div key={event.id} className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[6px] border border-[#d4af37]/20 bg-[#d4af37]/8 px-2 py-0.5 text-[11px] font-semibold text-[#d4af37]">{event.type}</span>
                  {event.discordAnnouncement && <Megaphone size={13} className="text-[#38bdf8]" />}
                </div>
                <h3 className="mt-2 text-[14px] font-semibold text-white">{event.title}</h3>
                <p className="mt-1 text-[12px] text-[#8ea4bd]">{formatDateTime(event.startsAt)}{event.endsAt ? ` -> ${formatDateTime(event.endsAt)}` : ''}</p>
              </div>
              {canManage && (
                <button type="button" onClick={() => deleteEvent(event.id)} className="rounded-[7px] p-1.5 text-[#6b8299] transition-colors hover:bg-[#321218]/60 hover:text-[#fca5a5]">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {event.location && <p className="mt-3 text-[12.5px] text-[#c7d4e4]">Ort: {event.location}</p>}
            {event.description && <p className="mt-2 text-[12.5px] leading-relaxed text-[#b7c5d8]">{event.description}</p>}
            {event.officer && (
              <Link href={`/officers/${event.officer.id}`} className="mt-3 inline-flex text-[12px] text-[#d4af37] hover:text-white">
                {event.officer.firstName} {event.officer.lastName} #{displayBadgeNumber(event.officer.badgeNumber)}
              </Link>
            )}
          </div>
        ))}
      </div>

      {(events ?? []).length === 0 && (
        <div className="glass-panel-elevated rounded-[14px] p-12 text-center">
          <CalendarDays size={28} className="mx-auto mb-3 text-[#d4af37]/35" />
          <p className="text-[13px] text-[#8ea4bd]">Keine SRU-Termine vorhanden</p>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="SRU-Termin erstellen">
        <div className="space-y-4">
          <Input label="Titel" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Select label="Art" value={form.type} onValueChange={(type) => setForm({ ...form, type })} options={sruEventTypes} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            <Input label="Ende optional" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </div>
          <Input label="Ort optional" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Select label="Officer-Bezug" value={form.officerId} onValueChange={(officerId) => setForm({ ...form, officerId })} options={officerOptions} />
          <Textarea label="Beschreibung" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          <label className="flex items-center gap-2 rounded-[9px] border border-[#18385f]/60 bg-[#0a1a33] px-3 py-2 text-[12.5px] text-[#b7c5d8]">
            <input type="checkbox" checked={form.discordAnnouncement} onChange={(e) => setForm({ ...form, discordAnnouncement: e.target.checked })} />
            Discord-Ankündigung senden
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={createEvent} disabled={!form.title.trim() || !form.startsAt}>Erstellen</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function SruPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'sru:view')
  const canManage = hasPermission(user, 'sru:manage')
  const [activeTab, setActiveTab] = useState<Tab>('documents')

  if (!canView) return <UnauthorizedContent />

  return (
    <div className="max-w-6xl mx-auto pb-2">
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-semibold transition-colors',
                active
                  ? 'border-[#d4af37]/45 bg-[#d4af37]/14 text-[#d4af37]'
                  : 'border-[#18385f]/60 bg-[#0a1a33]/55 text-[#8ea4bd] hover:border-[#234568] hover:text-white',
              )}
            >
              <Icon size={14} strokeWidth={2} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'documents' && <SruDocuments canManage={canManage} />}
      {activeTab === 'tasks' && (
        <TaskBoard
          module="SRU"
          title="SRU Aufgaben"
          description="Aufgabenlisten für SRU-Einsätze, Vorbereitung, Nachbereitung und interne Abläufe."
          accentLabel="Special Response Unit"
          viewPermission="sru:view"
          managePermission="sru:manage"
        />
      )}
      {activeTab === 'calendar' && <SruCalendar canManage={canManage} />}
    </div>
  )
}
