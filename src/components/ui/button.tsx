'use client'

import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/loading'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const variants = {
      primary: 'bg-[#e4c477] text-[#152332] hover:bg-[#f0d493] shadow-sm',
      secondary: 'border border-[#405264] bg-[#243545] text-[#edf4fb] hover:bg-[#30465a]',
      danger: 'bg-gradient-to-b from-[#2a1620] to-[#231218] text-[#fca5a5] hover:from-[#341b27] hover:to-[#2a1620] shadow-[0_1px_2px_rgba(0,0,0,0.12)]',
      ghost: 'text-[#9fb0c4] hover:text-white hover:bg-[#102542]/70',
      outline: 'border border-[#234568] text-[#edf4fb] hover:bg-[#102542]/50 shadow-[0_1px_2px_rgba(0,0,0,0.08)]',
    }

    const sizes = {
      sm: 'h-[36px] px-3 text-[12.5px] rounded-[7px] gap-1.5',
      md: 'h-[40px] px-4 text-[13px] rounded-[8px] gap-2',
      lg: 'h-[46px] px-5 text-[14px] rounded-[8px] gap-2',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-semibold transition-[background-color,color,border-color,transform] duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426]',
          'disabled:opacity-35 disabled:pointer-events-none',
          'active:scale-[0.98]',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && <Spinner size="sm" className="text-current" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button }
export type { ButtonProps }
