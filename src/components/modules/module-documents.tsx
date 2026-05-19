'use client'

import { useEffect, useMemo, useState } from 'react'
import { Eye, FileText, Folder, FolderPlus, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { ColorField } from '@/components/ui/color-field'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { cn, formatDateTime } from '@/lib/utils'
import { renderMarkdown } from '@/lib/markdown'
import type { ModuleCalendarKey } from '@/components/modules/module-calendar'

interface UserLite {
  id: string
  displayName: string
}

interface ModuleDocument {
  id: string
  folderId: string | null
  title: string
  content: string
  updatedAt: string
  updatedBy: UserLite | null
}

interface ModuleFolder {
  id: string
  name: string
  description: string | null
  color: string
  documents: ModuleDocument[]
}

interface DocumentsPayload {
  folders: ModuleFolder[]
  looseDocuments: ModuleDocument[]
}

interface ModuleDocumentsProps {
  module: ModuleCalendarKey
  title: string
  description: string
  emptyDocument: string
  canManage: boolean
}

const COLOR_PRESETS = ['#d4af37', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#fbbf24', '#06b6d4', '#f97316']

function documentPreview(content: string) {
  return content.split('\n').find((line) => line.trim())?.trim() || 'Kein Inhalt'
}

export function ModuleDocuments({ module, title: pageTitle, description, emptyDocument, canManage }: ModuleDocumentsProps) {
  const { data, loading, refetch } = useFetch<DocumentsPayload>(`/api/sru/folders?module=${module}`)
  const { execute } = useApi()
  const { addToast } = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [folderId, setFolderId] = useState('')
  const [dirty, setDirty] = useState(false)
  const [previewOnly, setPreviewOnly] = useState(false)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [folderForm, setFolderForm] = useState({ name: '', description: '', color: '#d4af37' })
  const [docForm, setDocForm] = useState({ title: '', folderId: '' })

  const allDocuments = useMemo(() => [
    ...(data?.looseDocuments ?? []),
    ...(data?.folders.flatMap((folder) => folder.documents) ?? []),
  ], [data])
  const selectedDocument = allDocuments.find((document) => document.id === selectedId) ?? null
  const folderOptions = useMemo(() => [
    { value: '', label: 'Ohne Ordner' },
    ...(data?.folders ?? []).map((folder) => ({ value: folder.id, label: folder.name })),
  ], [data])
  const previewHtml = useMemo(() => renderMarkdown(content), [content])

  useEffect(() => {
    if (!selectedDocument && allDocuments.length > 0) setSelectedId(allDocuments[0].id)
  }, [allDocuments, selectedDocument])

  useEffect(() => {
    if (!selectedDocument) {
      setTitle('')
      setContent('')
      setFolderId('')
      setDirty(false)
      return
    }
    if (dirty) return
    setTitle(selectedDocument.title)
    setContent(selectedDocument.content)
    setFolderId(selectedDocument.folderId ?? '')
  }, [dirty, selectedDocument])

  const createFolder = async () => {
    if (!folderForm.name.trim()) return
    try {
      await execute('/api/sru/folders', {
        method: 'POST',
        body: JSON.stringify({ ...folderForm, module, description: folderForm.description || null }),
      })
      addToast({ type: 'success', title: 'Ordner erstellt' })
      setFolderModalOpen(false)
      setFolderForm({ name: '', description: '', color: '#d4af37' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Ordner konnte nicht erstellt werden', message: err instanceof Error ? err.message : '' })
    }
  }

  const createDocument = async () => {
    if (!docForm.title.trim()) return
    try {
      const created = await execute('/api/sru/documents', {
        method: 'POST',
        body: JSON.stringify({
          module,
          title: docForm.title,
          folderId: docForm.folderId || null,
          content: emptyDocument,
        }),
      }) as ModuleDocument | null
      addToast({ type: 'success', title: 'Dokument erstellt' })
      setDocModalOpen(false)
      setDocForm({ title: '', folderId: '' })
      setDirty(false)
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
        body: JSON.stringify({ title, content, folderId: folderId || null }),
      })
      addToast({ type: 'success', title: 'Dokument gespeichert' })
      setDirty(false)
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
      setDirty(false)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Dokument konnte nicht gelöscht werden', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <PageHeader
        title={pageTitle}
        description={description}
        action={canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFolderModalOpen(true)}><FolderPlus size={13} /> Ordner</Button>
            <Button size="sm" onClick={() => setDocModalOpen(true)}><Plus size={13} /> Dokument</Button>
          </div>
        ) : undefined}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
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
                  <DocumentButton key={document.id} document={document} active={selectedId === document.id} onClick={() => { setDirty(false); setSelectedId(document.id) }} />
                ))}
              </div>
            )}
            {data?.folders.map((folder) => (
              <div key={folder.id} className="mb-3">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Folder size={13} style={{ color: folder.color }} />
                  <p className="flex-1 truncate text-[12.5px] font-semibold text-[#dbe6f3]">{folder.name}</p>
                </div>
                {folder.documents.length === 0 ? (
                  <p className="px-7 py-1 text-[11px] text-[#536b86]">Keine Dokumente</p>
                ) : (
                  folder.documents.map((document) => (
                    <DocumentButton key={document.id} document={document} color={folder.color} active={selectedId === document.id} onClick={() => { setDirty(false); setSelectedId(document.id) }} />
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
                  <Input label="Titel" value={title} onChange={(e) => { setDirty(true); setTitle(e.target.value) }} disabled={!canManage} required />
                  <div className="md:w-[240px]">
                    <Select label="Ordner" value={folderId} onValueChange={(nextFolderId) => { setDirty(true); setFolderId(nextFolderId) }} options={folderOptions} disabled={!canManage} />
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
                  {dirty ? ' · ungespeicherte Änderungen' : ''}
                </p>
              </div>
              <div className="flex items-center justify-end border-b border-[#18385f]/45 bg-[#071a30]/70 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setPreviewOnly((value) => !value)}
                  className={cn('inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[12px] font-medium transition-colors', previewOnly ? 'bg-[#d4af37] text-[#071b33]' : 'text-[#8ea4bd] hover:bg-[#102542] hover:text-white')}
                >
                  <Eye size={13} /> Vorschau
                </button>
              </div>
              <div className={cn('grid flex-1 min-h-[560px]', previewOnly ? 'grid-cols-1' : 'lg:grid-cols-2')}>
                {!previewOnly && (
                  <textarea
                    value={content}
                    onChange={(e) => { setDirty(true); setContent(e.target.value) }}
                    readOnly={!canManage}
                    className="min-h-[560px] resize-none border-r border-[#18385f]/45 bg-[#061426]/45 p-5 font-mono text-[13.5px] leading-7 text-[#edf4fb] outline-none placeholder:text-[#536b86]"
                    placeholder="Markdown schreiben..."
                  />
                )}
                <div className="min-h-[560px] overflow-y-auto bg-[#071a30]/35 p-5">
                  <article className="markdown-document mx-auto max-w-3xl rounded-[12px] border border-[#18385f]/55 bg-[#071426]/70 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.18)]" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[680px] flex-col items-center justify-center text-center">
              <FileText size={30} className="mb-3 text-[#4a6585]" />
              <p className="text-[13px] text-[#8ea4bd]">Dokument auswählen oder neu erstellen</p>
            </div>
          )}
        </section>
      </div>

      <Modal open={folderModalOpen} onClose={() => setFolderModalOpen(false)} title={`${pageTitle}: Ordner erstellen`}>
        <div className="space-y-4">
          <Input label="Name" value={folderForm.name} onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })} required />
          <Textarea label="Beschreibung" value={folderForm.description} onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })} rows={2} />
          <ColorField label="Ordnerfarbe" value={folderForm.color} onChange={(color) => setFolderForm({ ...folderForm, color })} presets={COLOR_PRESETS} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFolderModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={createFolder} disabled={!folderForm.name.trim()}>Erstellen</Button>
          </div>
        </div>
      </Modal>

      <Modal open={docModalOpen} onClose={() => setDocModalOpen(false)} title={`${pageTitle}: Dokument erstellen`}>
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

function DocumentButton({ document, color, active, onClick }: { document: ModuleDocument; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('w-full rounded-[10px] px-3 py-2 text-left transition-colors', active ? 'bg-[#d4af37]/12 border border-[#d4af37]/30' : 'border border-transparent hover:bg-[#102542]/65')}
    >
      <span className="mb-1 block h-1 w-8 rounded-full" style={{ backgroundColor: color ?? '#d4af37' }} />
      <p className="truncate text-[13px] font-medium text-[#edf4fb]">{document.title}</p>
      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-4 text-[#6b8299]">{documentPreview(document.content)}</p>
    </button>
  )
}
