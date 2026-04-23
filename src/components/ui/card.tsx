import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: boolean
}

export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div className={cn(
      'bg-[#fafafa] dark:bg-[#111] rounded-[12px]',
      padding && 'p-5',
      className
    )}>
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      <div>
        <h3 className="text-[13.5px] font-semibold text-[#111] dark:text-[#eee]">{title}</h3>
        {description && <p className="text-[12px] text-[#999] mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  )
}
