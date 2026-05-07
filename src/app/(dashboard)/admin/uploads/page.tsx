'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, FileArchive, FileText, ImageIcon, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { useFetch } from '@/hooks/use-fetch'
import { cn, formatDateTime } from '@/lib/utils'

interface UploadEntry {
  filename: string
  url: string
  size: number
  extension: string
  modifiedAt: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
}

function uploadIcon(extension: string) {
  const lower = extension.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(lower)) return ImageIcon
  if (lower === 'zip') return FileArchive
  return FileText
}

export default function AdminUploadsPage() {
  const { data: uploads, loading, refetch } = useFetch<UploadEntry[]>('/api/admin/uploads')
  const { execute } = useApi()
  const { addToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UploadEntry | null>(null)

  const handleUpload = async (file: File | null | undefined) => {
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.set('file', file)

      const res = await fetch('/api/admin/uploads', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null) as { success?: boolean; error?: string } | null
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Upload fehlgeschlagen')

      addToast({ type: 'success', title: 'Upload gespeichert' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      await execute('/api/admin/uploads', {
        method: 'DELETE',
        body: JSON.stringify({ filename: deleteTarget.filename }),
      })
      addToast({ type: 'success', title: 'Upload gelöscht' })
      setDeleteTarget(null)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Uploads"
        description="Hochgeladene Dateien verwalten"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RefreshCw size={13} strokeWidth={1.8} />
              Aktualisieren
            </Button>
            <Button size="sm" loading={uploading} onClick={() => inputRef.current?.click()}>
              <Upload size={13} strokeWidth={2} />
              Datei hochladen
            </Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(event) => void handleUpload(event.target.files?.[0])}
            />
          </div>
        }
      />

      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        <div className="divide-y divide-[#18385f]">
          {(uploads ?? []).map((upload) => {
            const Icon = uploadIcon(upload.extension)
            const isImage = ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'].includes(upload.extension)

            return (
              <div key={upload.filename} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#0f2340] transition-colors">
                <div className={cn(
                  'h-10 w-10 shrink-0 overflow-hidden rounded-[9px] border border-[#18385f]/70 bg-[#0a1a33] flex items-center justify-center',
                  isImage && 'bg-[#061426]',
                )}>
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={upload.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Icon size={17} className="text-[#d4af37]" strokeWidth={1.75} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-[#edf4fb]">{upload.filename}</p>
                  <p className="mt-0.5 text-[11.5px] text-[#6b8299]">
                    {upload.extension || 'DATEI'} · {formatBytes(upload.size)} · {formatDateTime(upload.modifiedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={upload.url}
                    target="_blank"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#8ea4bd] transition-colors hover:bg-[#0a1a33] hover:text-[#d4af37]"
                    title="Öffnen"
                  >
                    <ExternalLink size={14} strokeWidth={1.8} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(upload)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#8ea4bd] transition-colors hover:bg-[#1c1111] hover:text-[#f87171]"
                    title="Löschen"
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            )
          })}

          {(uploads ?? []).length === 0 && (
            <div className="px-5 py-14 text-center">
              <Upload size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#999]">Keine Uploads vorhanden</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Upload löschen">
        <div className="space-y-4">
          <p className="text-[13px] text-[#888]">
            <strong className="text-[#eee]">{deleteTarget?.filename}</strong> wird dauerhaft gelöscht.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>Abbrechen</Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>Löschen</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
