import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
      <div>
        <h1 className="text-[20px] font-semibold text-[#111] dark:text-white tracking-[-0.01em]">{title}</h1>
        {description && (
          <p className="text-[13px] text-[#999] mt-0.5">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
