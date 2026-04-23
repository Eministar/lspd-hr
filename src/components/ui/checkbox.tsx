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
    <label className={cn('flex items-center gap-2 cursor-pointer', disabled && 'opacity-50 cursor-not-allowed', className)}>
      <CheckboxPrimitive.Root
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className={cn(
          'h-5 w-5 rounded-md border-2 transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          checked
            ? 'bg-blue-600 border-blue-600 text-white'
            : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900'
        )}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center">
          <Check size={14} strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label && <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>}
    </label>
  )
}
