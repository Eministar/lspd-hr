'use client'

import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const variants = {
      primary: 'bg-[#111] text-white hover:bg-[#333] dark:bg-white dark:text-[#111] dark:hover:bg-[#e5e5e5]',
      secondary: 'bg-[#f5f5f5] text-[#333] hover:bg-[#eee] dark:bg-[#1a1a1a] dark:text-[#ddd] dark:hover:bg-[#222]',
      danger: 'bg-[#f5f5f5] text-[#dc2626] hover:bg-[#fef2f2] dark:bg-[#1a1a1a] dark:text-[#f87171] dark:hover:bg-[#1c1111]',
      ghost: 'text-[#666] hover:text-[#111] hover:bg-[#f5f5f5] dark:text-[#888] dark:hover:text-white dark:hover:bg-[#1a1a1a]',
      outline: 'border border-[#e5e5e5] dark:border-[#2a2a2a] text-[#333] dark:text-[#ccc] hover:bg-[#f9f9f9] dark:hover:bg-[#151515]',
    }

    const sizes = {
      sm: 'h-[32px] px-3 text-[12.5px] rounded-[8px] gap-1.5',
      md: 'h-[36px] px-4 text-[13px] rounded-[9px] gap-2',
      lg: 'h-[40px] px-5 text-[13.5px] rounded-[10px] gap-2',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111]/20 dark:focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0a0a0a]',
          'disabled:opacity-35 disabled:pointer-events-none',
          'active:scale-[0.98]',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button }
export type { ButtonProps }
