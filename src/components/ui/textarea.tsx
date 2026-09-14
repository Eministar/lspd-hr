'use client'

import { forwardRef, useId, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { fieldClass, fieldErrorClass, fieldLabelClass } from '@/components/ui/input'

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
          <label htmlFor={inputId} className={fieldLabelClass}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn('lspd-field resize-none px-3 py-2 leading-relaxed', fieldClass, error && fieldErrorClass, className)}
          {...props}
        />
        {error && <p id={`${inputId}-error`} className="text-[12px] text-red">{error}</p>}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
