'use client'

import { forwardRef, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-[12.5px] font-medium text-[#888] dark:text-[#777]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={cn(
            'w-full px-3 py-2.5 rounded-[9px] text-[13.5px]',
            'bg-[#f5f5f5] dark:bg-[#1a1a1a]',
            'text-[#111] dark:text-[#eee]',
            'placeholder:text-[#bbb] dark:placeholder:text-[#555]',
            'border border-transparent',
            'focus:outline-none focus:border-[#ddd] dark:focus:border-[#333]',
            'transition-colors duration-150 resize-none',
            error && 'border-red-300',
            className
          )}
          {...props}
        />
        {error && <p className="text-[11.5px] text-red-500">{error}</p>}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
