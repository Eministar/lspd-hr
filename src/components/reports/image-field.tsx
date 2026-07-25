'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

interface ImageFieldProps {
  label: string
  description?: string
  value: string
  onChange: (url: string) => void
  disabled?: boolean
  className?: string
}

/**
 * Bildfeld für Akten und Anzeigen: lädt in den geschützten Upload-Ordner hoch
 * und gibt die interne `/uploads/...`-URL zurück. Genau diese Form akzeptiert
 * die API — fremde URLs werden serverseitig verworfen.
 */
export function ImageField({ label, description, value, onChange, disabled, className }: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const { addToast } = useToast()

  const upload = async (file: File | undefined) => {
    if (!file || disabled) return
    setUploading(true)
    try {
      const body = new FormData()
      body.set('file', file)
      const res = await fetch('/api/reports/uploads', { method: 'POST', body, credentials: 'include' })
      const json = await res.json().catch(() => null) as
        { success?: boolean; error?: string; data?: { url: string } } | null
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Bild konnte nicht hochgeladen werden')
      }
      onChange(json.data.url)
    } catch (e) {
      addToast({ type: 'error', title: 'Upload fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-[12.5px] font-medium text-[#9fb0c4]">{label}</p>

      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className={cn(
            'relative flex h-[86px] w-[126px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-dashed bg-[#0a1a33]/60 transition-colors',
            value ? 'border-[#d4af37]/40' : 'border-[#234568]',
            disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-[#d4af37]/60',
          )}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : uploading ? (
            <Loader2 size={18} className="animate-spin text-[#d4af37]" />
          ) : (
            <ImagePlus size={18} className="text-[#4a6585]" />
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          {description && <p className="text-[11.5px] leading-4 text-[#6b8299]">{description}</p>}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
              className="rounded-[7px] border border-[#234568] px-2 py-1 text-[11.5px] font-medium text-[#edf4fb] transition-colors hover:bg-[#102542]/60 disabled:opacity-40"
            >
              {uploading ? 'Lädt…' : value ? 'Ersetzen' : 'Bild hochladen'}
            </button>
            {value && !disabled && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="inline-flex items-center gap-1 rounded-[7px] border border-[#7f1d1d]/50 px-2 py-1 text-[11.5px] font-medium text-[#fca5a5] transition-colors hover:bg-[#2a1620]/60"
              >
                <Trash2 size={11} />
                Entfernen
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
    </div>
  )
}
