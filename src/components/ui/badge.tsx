import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

const variants = {
  default: 'bg-white/[0.07] text-label-2',
  success: 'bg-green/15 text-green',
  warning: 'bg-yellow/12 text-yellow',
  danger: 'bg-red/15 text-red',
  info: 'bg-blue/15 text-blue',
}

export function Badge({ children, className, variant = 'default' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
