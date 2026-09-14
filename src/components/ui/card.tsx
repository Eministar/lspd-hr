import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: boolean
}

export function Card({ children, className, padding = true }: CardProps) {
  return <div className={cn('lspd-card', padding && 'p-5', className)}>{children}</div>
}

interface CardHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-label">{title}</h3>
        {description && <p className="mt-0.5 text-[12.5px] leading-relaxed text-label-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
