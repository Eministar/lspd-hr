'use client'

/* eslint-disable react-hooks/refs */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold, ChevronRight, Code, Eye, FileText, Folder, FolderPlus, Heading1, Heading2, Heading3,
  Italic, Link2, List, ListOrdered, ListTodo, Maximize2, Minimize2, Plus, Quote, RefreshCw,
  Save, Search, SquareSplitHorizontal, Strikethrough, Table2, Trash2, Type,
} from 'lucide-react'
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

interface UserLite { id: string; displayName: string }
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
interface DocumentsPayload { folders: ModuleFolder[]; looseDocuments: ModuleDocument[] }

interface ModuleDocumentsProps {
  module: ModuleCalendarKey
  title: string
  description: string
  emptyDocument: string
  canManage: boolean
}

const COLOR_PRESETS = ['#d4af37', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#fbbf24', '#06b6d4', '#f97316']
type ViewMode = 'edit' | 'split' | 'preview'

function preview(text: string) {
  return text.split('\n').find((l) => l.trim() && !l.trim().startsWith('#'))?.trim() || text.split('\n').find((l) => l.trim())?.trim() || 'Leer'
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'gerade eben'
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`
  if (diff < 604800) return `vor ${Math.floor(diff / 86400)} Tag(en)`
  return formatDateTime(iso)
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
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [fullscreen, setFullscreen] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [folderForm, setFolderForm] = useState({ name: '', description: '', color: '#d4af37' })
  const [docForm, setDocForm] = useState({ title: '', folderId: '' })
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const allDocuments = useMemo(() => [
    ...(data?.looseDocuments ?? []),
    ...(data?.folders.flatMap((f) => f.documents) ?? []),
  ], [data])
  const selectedDocument = allDocuments.find((d) => d.id === selectedId) ?? null
  const folderOptions = useMemo(() => [
    { value: '', label: 'Ohne Ordner' },
    ...(data?.folders ?? []).map((f) => ({ value: f.id, label: f.name })),
  ], [data])
  const previewHtml = useMemo(() => renderMarkdown(content), [content])
  const wordCount = useMemo(() => countWords(content), [content])
  const charCount = content.length

  const matchesSearch = useCallback((doc: ModuleDocument) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return doc.title.toLowerCase().includes(q) || doc.content.toLowerCase().includes(q)
  }, [search])

  useEffect(() => {
    if (!selectedDocument && allDocuments.length > 0) setSelectedId(allDocuments[0].id)
  }, [allDocuments, selectedDocument])

  useEffect(() => {
    if (!selectedDocument) { setTitle(''); setContent(''); setFolderId(''); setDirty(false); return }
    if (dirty) return
    setTitle(selectedDocument.title)
    setContent(selectedDocument.content)
    setFolderId(selectedDocument.folderId ?? '')
  }, [dirty, selectedDocument])

  const toggleFolder = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const saveDocument = useCallback(async () => {
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
      addToast({ type: 'error', title: 'Speichern fehlgeschlagen', message: err instanceof Error ? err.message : '' })
    }
  }, [addToast, content, execute, folderId, refetch, selectedDocument, title])

  // Cmd/Ctrl+S to save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && canManage && title.trim()) void saveDocument()
      }
      if (e.key === 'Escape' && fullscreen) setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canManage, dirty, fullscreen, saveDocument, title])

  const wrapSelection = useCallback((before: string, after = before, placeholder = '') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = content.slice(start, end) || placeholder
    const next = content.slice(0, start) + before + selected + after + content.slice(end)
    setDirty(true)
    setContent(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }, [content])

  const insertAtLineStart = useCallback((prefix: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = content.lastIndexOf('\n', start - 1) + 1
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart)
    setDirty(true)
    setContent(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, start + prefix.length)
    })
  }, [content])

  const insertBlock = useCallback((block: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const needsNewline = start > 0 && content[start - 1] !== '\n'
    const insert = (needsNewline ? '\n' : '') + block + '\n'
    const next = content.slice(0, start) + insert + content.slice(start)
    setDirty(true)
    setContent(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + insert.length, start + insert.length)
    })
  }, [content])

  const toolbarActions = useMemo(() => ({
    heading1: () => insertAtLineStart('# '),
    heading2: () => insertAtLineStart('## '),
    heading3: () => insertAtLineStart('### '),
    bold: () => wrapSelection('**', '**', 'fett'),
    italic: () => wrapSelection('*', '*', 'kursiv'),
    strike: () => wrapSelection('~~', '~~', 'text'),
    code: () => wrapSelection('`', '`', 'code'),
    unorderedList: () => insertAtLineStart('- '),
    orderedList: () => insertAtLineStart('1. '),
    checklist: () => insertAtLineStart('- [ ] '),
    quote: () => insertAtLineStart('> '),
    link: () => wrapSelection('[', '](https://)', 'Link-Text'),
    table: () => insertBlock('| Spalte 1 | Spalte 2 |\n| --- | --- |\n|  |  |'),
  }), [insertAtLineStart, insertBlock, wrapSelection])

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
        body: JSON.stringify({ module, title: docForm.title, folderId: docForm.folderId || null, content: emptyDocument }),
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

  const deleteDocument = async () => {
    if (!selectedDocument || !confirm(`Dokument "${selectedDocument.title}" löschen?`)) return
    try {
      await execute(`/api/sru/documents/${selectedDocument.id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Dokument gelöscht' })
      setSelectedId(null)
      setDirty(false)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Löschen fehlgeschlagen', message: err instanceof Error ? err.message : '' })
    }
  }

  const selectDocument = (id: string) => {
    if (id === selectedId) return
    if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return
    setDirty(false)
    setSelectedId(id)
  }

  if (loading) return <PageLoader />

  const filteredLoose = (data?.looseDocuments ?? []).filter(matchesSearch)
  const filteredFolders = (data?.folders ?? []).map((f) => ({ ...f, documents: f.documents.filter(matchesSearch) }))

  const editor = (
      <div className={cn(
          'grid min-h-0 overflow-hidden',
          viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1',
          fullscreen ? 'h-full' : 'h-[min(72vh,760px)] min-h-[560px]',
      )}>
        {viewMode !== 'preview' && (
            <div className="relative flex min-h-0 flex-col border-r border-[#18385f]/45 bg-[#04101f]/60">
          <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => { setDirty(true); setContent(e.target.value) }}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const ta = e.currentTarget
                  const start = ta.selectionStart
                  const end = ta.selectionEnd
                  setContent(content.slice(0, start) + '  ' + content.slice(end))
                  setDirty(true)
                  requestAnimationFrame(() => { ta.setSelectionRange(start + 2, start + 2) })
                }
              }}
              readOnly={!canManage}
              spellCheck
              className="h-full min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent p-6 font-mono text-[13.5px] leading-[1.75] text-[#edf4fb] outline-none placeholder:text-[#3d556f] selection:bg-[#d4af37]/30"
              placeholder="Markdown schreiben…&#10;&#10;# Überschrift&#10;**fett** *kursiv*&#10;- Liste"
          />
            </div>
        )}
        {viewMode !== 'edit' && (
            <div className="min-h-0 overflow-y-auto bg-gradient-to-b from-[#071a30]/40 to-[#04101f]/30 p-6">
              <article
                  className="markdown-document mx-auto max-w-3xl rounded-[14px] border border-[#18385f]/55 bg-[#071426]/80 p-7 shadow-[0_18px_50px_rgba(0,0,0,0.25)]"
                  dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-[#536b86] italic">Vorschau erscheint hier...</p>' }}
              />
            </div>
        )}
      </div>
  )

  const toolbarBtn = (icon: React.ReactNode, label: string, onClick: () => void) => (
      <button
          type="button"
          onClick={onClick}
          title={label}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-[#8ea4bd] transition-colors hover:bg-[#102542] hover:text-[#d4af37]"
      >
        {icon}
      </button>
  )

  const editorPanel = (
      <section className={cn(
          'glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 overflow-hidden',
          fullscreen && 'fixed inset-4 z-50 flex min-h-0 flex-col',
      )}>
        {selectedDocument ? (
            <div className="flex h-full min-h-0 flex-col">
              {/* Title bar */}
              <div className="border-b border-[#18385f]/45 bg-gradient-to-r from-[#071a30]/80 to-[#091e36]/60 p-4 space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <Input label="Titel" value={title} onChange={(e) => { setDirty(true); setTitle(e.target.value) }} disabled={!canManage} required />
                  <div className="lg:w-[220px]">
                    <Select label="Ordner" value={folderId} onValueChange={(v) => { setDirty(true); setFolderId(v) }} options={folderOptions} disabled={!canManage} />
                  </div>
                  {canManage && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveDocument} disabled={!title.trim() || !dirty}>
                          <Save size={13} /> {dirty ? 'Speichern' : 'Gespeichert'}
                        </Button>
                        <Button variant="danger" size="sm" onClick={deleteDocument}><Trash2 size={13} /></Button>
                      </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-[#6b8299]">
              <span className="inline-flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', dirty ? 'bg-[#fbbf24] animate-pulse' : 'bg-[#34d399]')} />
                {dirty ? 'Ungespeicherte Änderungen' : 'Aktuell'}
              </span>
                  <span>·</span>
                  <span>{wordCount} Wörter</span>
                  <span>·</span>
                  <span>{charCount} Zeichen</span>
                  <span>·</span>
                  <span>Aktualisiert {relativeTime(selectedDocument.updatedAt)}{selectedDocument.updatedBy ? ` von ${selectedDocument.updatedBy.displayName}` : ''}</span>
                  <span className="ml-auto hidden md:inline text-[#536b86]">⌘/Ctrl + S zum Speichern</span>
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-1 border-b border-[#18385f]/45 bg-[#061426]/70 px-3 py-1.5">
                {canManage && (
                    <>
                      <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[#18385f]/60">
                        {toolbarBtn(<Heading1 size={15} />, 'Überschrift 1', toolbarActions.heading1)}
                        {toolbarBtn(<Heading2 size={15} />, 'Überschrift 2', toolbarActions.heading2)}
                        {toolbarBtn(<Heading3 size={15} />, 'Überschrift 3', toolbarActions.heading3)}
                      </div>
                      <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[#18385f]/60">
                        {toolbarBtn(<Bold size={15} />, 'Fett', toolbarActions.bold)}
                        {toolbarBtn(<Italic size={15} />, 'Kursiv', toolbarActions.italic)}
                        {toolbarBtn(<Strikethrough size={15} />, 'Durchgestrichen', toolbarActions.strike)}
                        {toolbarBtn(<Code size={15} />, 'Code', toolbarActions.code)}
                      </div>
                      <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[#18385f]/60">
                        {toolbarBtn(<List size={15} />, 'Aufzählung', toolbarActions.unorderedList)}
                        {toolbarBtn(<ListOrdered size={15} />, 'Nummeriert', toolbarActions.orderedList)}
                        {toolbarBtn(<ListTodo size={15} />, 'Aufgabe', toolbarActions.checklist)}
                        {toolbarBtn(<Quote size={15} />, 'Zitat', toolbarActions.quote)}
                      </div>
                      <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[#18385f]/60">
                        {toolbarBtn(<Link2 size={15} />, 'Link', toolbarActions.link)}
                        {toolbarBtn(<Table2 size={15} />, 'Tabelle', toolbarActions.table)}
                      </div>
                    </>
                )}
                <div className="ml-auto flex items-center gap-0.5">
                  {(['edit', 'split', 'preview'] as ViewMode[]).map((mode) => {
                    const Icon = mode === 'edit' ? Type : mode === 'split' ? SquareSplitHorizontal : Eye
                    const label = mode === 'edit' ? 'Editor' : mode === 'split' ? 'Geteilt' : 'Vorschau'
                    return (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setViewMode(mode)}
                            title={label}
                            className={cn(
                                'inline-flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[11.5px] font-medium transition-colors',
                                viewMode === mode ? 'bg-[#d4af37]/15 text-[#d4af37]' : 'text-[#8ea4bd] hover:bg-[#102542] hover:text-white',
                            )}
                        >
                          <Icon size={13} /> {label}
                        </button>
                    )
                  })}
                  <button
                      type="button"
                      onClick={() => setFullscreen((v) => !v)}
                      title={fullscreen ? 'Vollbild verlassen' : 'Vollbild'}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-[#8ea4bd] transition-colors hover:bg-[#102542] hover:text-white ml-1"
                  >
                    {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">{editor}</div>
            </div>
        ) : (
            <div className="flex min-h-[680px] flex-col items-center justify-center text-center px-6">
              <div className="rounded-full bg-[#d4af37]/10 p-5 mb-4">
                <FileText size={32} className="text-[#d4af37]/70" />
              </div>
              <p className="text-[14px] font-semibold text-[#dbe6f3] mb-1">Kein Dokument ausgewählt</p>
              <p className="text-[12.5px] text-[#8ea4bd] mb-4 max-w-xs">Wähle ein Dokument aus der Seitenleiste oder erstelle ein neues.</p>
              {canManage && <Button size="sm" onClick={() => setDocModalOpen(true)}><Plus size={13} /> Neues Dokument</Button>}
            </div>
        )}
      </section>
  )

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

        {fullscreen && <div className="fixed inset-0 bg-[#03070d]/85 backdrop-blur-sm z-40" onClick={() => setFullscreen(false)} />}

        <div className={cn('grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4', fullscreen && 'lg:grid-cols-1')}>
          {!fullscreen && (
              <aside className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 overflow-hidden">
                <div className="border-b border-[#18385f]/45 px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#8ea4bd]">Ablage</p>
                    <div className="flex items-center gap-1">
                      <span className="text-[10.5px] text-[#536b86]">{allDocuments.length}</span>
                      <button type="button" onClick={refetch} className="p-1 rounded-[6px] text-[#6b8299] hover:text-[#d4af37] hover:bg-[#102542]/70" title="Aktualisieren">
                        <RefreshCw size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#536b86]" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Suchen…"
                        className="h-8 w-full rounded-[7px] border border-[#18385f]/60 bg-[#04101f] pl-7 pr-2 text-[12px] text-[#edf4fb] placeholder:text-[#536b86] outline-none focus:border-[#d4af37]/40"
                    />
                  </div>
                </div>
                <div className="max-h-[640px] overflow-y-auto p-1.5">
                  {filteredLoose.length > 0 && (
                      <div className="mb-2">
                        <p className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[#536b86] font-semibold">Ohne Ordner</p>
                        {filteredLoose.map((doc) => (
                            <DocumentButton key={doc.id} document={doc} active={selectedId === doc.id} onClick={() => selectDocument(doc.id)} />
                        ))}
                      </div>
                  )}
                  {filteredFolders.map((folder) => {
                    const collapsed = collapsedFolders.has(folder.id)
                    if (search && folder.documents.length === 0) return null
                    return (
                        <div key={folder.id} className="mb-1.5">
                          <button
                              type="button"
                              onClick={() => toggleFolder(folder.id)}
                              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-[7px] hover:bg-[#102542]/55 transition-colors group"
                          >
                            <ChevronRight size={11} className={cn('text-[#536b86] transition-transform', !collapsed && 'rotate-90')} />
                            <Folder size={12} style={{ color: folder.color }} />
                            <span className="flex-1 truncate text-left text-[12px] font-semibold text-[#dbe6f3]">{folder.name}</span>
                            <span className="text-[10px] text-[#536b86]">{folder.documents.length}</span>
                          </button>
                          {!collapsed && (
                              <div className="ml-1.5 pl-2 border-l border-[#18385f]/40">
                                {folder.documents.length === 0 ? (
                                    <p className="px-2 py-1.5 text-[10.5px] text-[#536b86] italic">Leer</p>
                                ) : (
                                    folder.documents.map((doc) => (
                                        <DocumentButton key={doc.id} document={doc} color={folder.color} active={selectedId === doc.id} onClick={() => selectDocument(doc.id)} />
                                    ))
                                )}
                              </div>
                          )}
                        </div>
                    )
                  })}
                  {allDocuments.length === 0 && (
                      <div className="py-12 text-center px-4">
                        <FileText size={22} className="mx-auto mb-2 text-[#4a6585]" />
                        <p className="text-[12px] text-[#8ea4bd] mb-3">Noch keine Dokumente</p>
                        {canManage && (
                            <Button size="sm" variant="secondary" onClick={() => setDocModalOpen(true)}>
                              <Plus size={12} /> Erstellen
                            </Button>
                        )}
                      </div>
                  )}
                  {allDocuments.length > 0 && search && filteredLoose.length === 0 && filteredFolders.every((f) => f.documents.length === 0) && (
                      <p className="py-8 text-center text-[11.5px] text-[#536b86]">Keine Treffer für {search}</p>
                  )}
                </div>
              </aside>
          )}

          {editorPanel}
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
            <Select label="Ordner" value={docForm.folderId} onValueChange={(v) => setDocForm({ ...docForm, folderId: v })} options={folderOptions} />
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
          className={cn(
              'w-full rounded-[8px] px-2.5 py-2 text-left transition-all group relative',
              active
                  ? 'bg-gradient-to-r from-[#d4af37]/15 to-[#d4af37]/5 border border-[#d4af37]/30 shadow-[0_2px_10px_rgba(212,175,55,0.08)]'
                  : 'border border-transparent hover:bg-[#102542]/60',
          )}
      >
        {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[2px] rounded-r bg-[#d4af37]" />}
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color ?? '#d4af37' }} />
          <p className={cn('truncate text-[12.5px] font-medium flex-1', active ? 'text-white' : 'text-[#edf4fb]')}>{document.title}</p>
        </div>
        <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-[#6b8299] pl-3.5">{preview(document.content)}</p>
      </button>
  )
}
