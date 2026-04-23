import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

export function Badge({ children, className, variant = 'default' }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-[3px] rounded-[6px] text-[11.5px] font-medium',
      'bg-[#f0f0f0] text-[#555] dark:bg-[#1a1a1a] dark:text-[#999]',
      className
    )}>
      {children}
    </span>
  )
}
