'use client'

import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-[12.5px] font-medium text-[#888] dark:text-[#777]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full h-[36px] px-3 rounded-[9px] text-[13.5px]',
            'bg-[#f5f5f5] dark:bg-[#1a1a1a]',
            'text-[#111] dark:text-[#eee]',
            'placeholder:text-[#bbb] dark:placeholder:text-[#555]',
            'border border-transparent',
            'focus:outline-none focus:border-[#ddd] dark:focus:border-[#333] focus:ring-0',
            'transition-colors duration-150',
            error && 'border-red-300 dark:border-red-900',
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
