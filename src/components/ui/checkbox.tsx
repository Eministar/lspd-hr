'use client'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
}

export function Checkbox({ checked, onCheckedChange, label, disabled, className }: CheckboxProps) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5', disabled && 'cursor-not-allowed opacity-50', className)}>
      <CheckboxPrimitive.Root
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-[background-color,border-color,scale] duration-150 ease-out active:scale-90',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-gold/45',
          checked
            ? 'border-gold bg-gold text-ink shadow-[inset_0_0.5px_0_rgb(255_255_255/0.35)]'
            : 'border-line-strong bg-surface-3'
        )}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center">
          <Check size={11} strokeWidth={3.25} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label && <span className="text-[13.5px] text-label">{label}</span>}
    </label>
  )
}
