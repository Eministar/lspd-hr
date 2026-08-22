'use client'

import { forwardRef, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /** Zeigt und akzeptiert ausschließlich Ziffern (auch bei Copy & Paste). */
  numericOnly?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, numericOnly = false, onChange, value, defaultValue, inputMode, pattern, type, ...props }, ref) => {
    const visibleValue = numericOnly && typeof value === 'string' ? value.replace(/\D/g, '') : value
    const visibleDefaultValue = numericOnly && typeof defaultValue === 'string' ? defaultValue.replace(/\D/g, '') : defaultValue

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      if (numericOnly) event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '')
      onChange?.(event)
    }

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-[12.5px] font-medium text-[#9fb0c4]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          type={numericOnly ? 'text' : type}
          inputMode={numericOnly ? 'numeric' : inputMode}
          pattern={numericOnly ? '[0-9]*' : pattern}
          value={visibleValue}
          defaultValue={visibleDefaultValue}
          onChange={handleChange}
          className={cn(
            'w-full h-[36px] px-3 rounded-[9px] text-[13.5px]',
            'bg-[#0a1a33]/60 text-[#edf4fb]',
            'placeholder:text-[#4a6585]',
            'border border-[#18385f]/70',
            'focus:outline-none focus:border-[#d4af37] focus:shadow-[0_0_0_3px_rgba(212,175,55,0.08)]',
            'transition-all duration-150',
            error && 'border-red-900 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]',
            className
          )}
          {...props}
        />
        {error && <p className="text-[11.5px] text-red-500">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
