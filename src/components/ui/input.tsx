'use client'

import { forwardRef, useId, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /** Zeigt und akzeptiert ausschließlich Ziffern (auch bei Copy & Paste). */
  numericOnly?: boolean
}

/** Gemeinsame Optik aller Textfelder (Input, Textarea, Trigger von Select/DateField). */
export const fieldClass = cn(
  'w-full rounded-[8px] border border-line-strong bg-surface-2 text-[13.5px] text-label',
  'placeholder:text-label-4 outline-none',
  'transition-[border-color,box-shadow,background-color] duration-150 ease-out',
  'hover:border-white/20 focus:border-gold/80 focus:ring-[3px] focus:ring-gold/25'
)

export const fieldErrorClass = 'border-red/70 hover:border-red/70 focus:border-red focus:ring-red/25'

export const fieldLabelClass = 'block text-[12.5px] font-medium text-label-2'

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, numericOnly = false, onChange, value, defaultValue, inputMode, pattern, type, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const visibleValue = numericOnly && typeof value === 'string' ? value.replace(/\D/g, '') : value
    const visibleDefaultValue = numericOnly && typeof defaultValue === 'string' ? defaultValue.replace(/\D/g, '') : defaultValue

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      if (numericOnly) event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '')
      onChange?.(event)
    }

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className={fieldLabelClass}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          type={numericOnly ? 'text' : type}
          inputMode={numericOnly ? 'numeric' : inputMode}
          pattern={numericOnly ? '[0-9]*' : pattern}
          value={visibleValue}
          defaultValue={visibleDefaultValue}
          onChange={handleChange}
          className={cn('lspd-field h-[34px] px-3', fieldClass, error && fieldErrorClass, className)}
          {...props}
        />
        {error && <p id={`${inputId}-error`} className="text-[12px] text-red">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
