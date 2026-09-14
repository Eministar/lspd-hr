import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  action?: ReactNode
  className?: string
}

/** Large Title nach Apple-Vorbild; Kontext (eyebrow) steht leise darüber, nicht in Versalien. */
export function PageHeader({ title, description, eyebrow, action, className }: PageHeaderProps) {
  return (
    <header className={className ? `lspd-page-header ${className}` : 'lspd-page-header'}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-[13px] font-medium text-label-3">{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p className="mt-1.5 text-[14px] leading-relaxed text-label-2">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
    </header>
  )
}
