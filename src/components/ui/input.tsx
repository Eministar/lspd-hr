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
          <label htmlFor={id} className="block text-[12.5px] font-medium text-[#9fb0c4]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
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
