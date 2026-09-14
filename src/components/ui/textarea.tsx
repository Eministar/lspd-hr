'use client'

import { forwardRef, useId, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-[12.5px] font-medium text-[#b1c2d7]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'lspd-field w-full px-3 py-2.5 rounded-[9px] text-[13.5px]',
            'bg-[#0a1a33]/60 text-[#edf4fb]',
            'placeholder:text-[#8298b3]',
            'border border-[#355576]/70',
            'focus:outline-none focus:border-[#d4af37] focus:shadow-[0_0_0_3px_rgba(212,175,55,0.08)]',
            'transition-[border-color,box-shadow,background-color] duration-150 resize-none',
            error && 'border-red-300',
            className
          )}
          {...props}
        />
        {error && <p id={`${inputId}-error`} className="text-[12px] text-red-300">{error}</p>}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
