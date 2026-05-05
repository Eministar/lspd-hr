'use client'

import * as React from 'react'
import { Check, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ColorFieldProps {
  label?: string
  value: string
  onChange: (value: string) => void
  id?: string
  presets?: string[]
  className?: string
}

const DEFAULT_PRESETS = [
  '#d4af37',
  '#60a5fa',
  '#34d399',
  '#f87171',
  '#a78bfa',
  '#fbbf24',
  '#06b6d4',
  '#ef4444',
]

function normalizeHex(value: string) {
  const raw = value.trim()
  const short = raw.match(/^#?([0-9a-f]{3})$/i)?.[1]
  if (short) {
    return `#${short.split('').map((char) => char + char).join('')}`.toLowerCase()
  }

  const full = raw.match(/^#?([0-9a-f]{6})$/i)?.[1]
  return full ? `#${full.toLowerCase()}` : null
}

function colorInputValue(value: string) {
  return normalizeHex(value) ?? '#d4af37'
}

export function ColorField({
  label = 'Farbe',
  value,
  onChange,
  id,
  presets = DEFAULT_PRESETS,
  className,
}: ColorFieldProps) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  const normalizedValue = normalizeHex(value)
  const previewColor = normalizedValue ?? '#4a6585'

  const commitTypedValue = () => {
    const normalized = normalizeHex(value)
    if (normalized && normalized !== value) onChange(normalized)
  }

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label htmlFor={fieldId} className="block text-[12.5px] font-medium text-[#9fb0c4]">
          {label}
        </label>
      )}

      <div className="rounded-[12px] border border-[#18385f]/70 bg-[#0a1a33]/45 p-2.5">
        <div className="flex items-center gap-2.5">
          <label
            className="relative flex h-[36px] w-[46px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[9px] border border-[#234568]/80 bg-[#102542] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            style={{ backgroundColor: previewColor }}
            aria-label="Farbe auswählen"
          >
            <input
              type="color"
              value={colorInputValue(value)}
              onChange={(event) => onChange(event.target.value)}
              className="sr-only"
              tabIndex={-1}
            />
            <Palette
              size={15}
              strokeWidth={1.85}
              className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
              style={{ color: normalizedValue ? '#071b33' : '#8ea4bd' }}
            />
          </label>

          <input
            id={fieldId}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={commitTypedValue}
            spellCheck={false}
            placeholder="#d4af37"
            className={cn(
              'h-[36px] min-w-0 flex-1 rounded-[9px] border px-3 font-mono text-[13px] uppercase transition-all duration-150',
              'border-[#18385f]/70 bg-[#071a30]/75 text-[#edf4fb] placeholder:text-[#4a6585]',
              'focus:outline-none focus:border-[#d4af37] focus:shadow-[0_0_0_3px_rgba(212,175,55,0.08)]',
              !normalizedValue && value.trim() && 'border-red-500/50',
            )}
          />
        </div>

        <div className="mt-2.5 grid grid-cols-8 gap-1.5">
          {presets.map((color) => {
            const normalizedPreset = normalizeHex(color) ?? color
            const selected = normalizedValue === normalizedPreset

            return (
              <button
                key={color}
                type="button"
                onClick={() => onChange(normalizedPreset)}
                className={cn(
                  'relative h-7 rounded-[7px] border transition-all duration-150',
                  selected
                    ? 'border-white shadow-[0_0_0_2px_rgba(212,175,55,0.22)]'
                    : 'border-[#18385f]/60 hover:border-[#8ea4bd]/80',
                )}
                style={{ backgroundColor: normalizedPreset }}
                aria-label={`Farbe ${normalizedPreset}`}
                aria-pressed={selected}
              >
                {selected && (
                  <Check
                    size={13}
                    strokeWidth={2.8}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#071b33] drop-shadow-[0_1px_1px_rgba(255,255,255,0.35)]"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
