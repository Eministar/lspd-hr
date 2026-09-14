'use client'

import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/loading'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variants = {
  primary: 'bg-gold text-ink hover:bg-gold-bright shadow-[inset_0_0.5px_0_rgb(255_255_255/0.35),0_1px_2px_rgb(0_0_0/0.3)]',
  secondary: 'border border-line-strong bg-surface-3 text-label hover:bg-surface-4 shadow-[0_1px_1px_rgb(0_0_0/0.25)]',
  danger: 'bg-red/15 text-red hover:bg-red/25',
  ghost: 'text-label-2 hover:bg-white/[0.06] hover:text-label',
  outline: 'border border-line-strong text-label hover:bg-white/[0.05]',
}

const sizes = {
  sm: 'h-7 gap-1.5 rounded-[7px] px-2.5 text-[12.5px]',
  md: 'h-[34px] gap-2 rounded-[8px] px-3.5 text-[13px]',
  lg: 'h-10 gap-2 rounded-[10px] px-5 text-[14px]',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'lspd-button relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,border-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-gold/45',
        'disabled:pointer-events-none disabled:opacity-40',
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
)
Button.displayName = 'Button'

export { Button }
export type { ButtonProps }
