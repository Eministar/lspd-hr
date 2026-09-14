'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link, { type LinkProps } from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const linkBase =
  'inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] text-[14px] font-medium transition-[background-color,color,scale] duration-150 ease-out focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-gold/45 active:scale-[0.97]'

const linkVariants = {
  primary: 'bg-gold text-ink hover:bg-gold-bright shadow-[inset_0_0.5px_0_rgb(255_255_255/0.35),0_1px_2px_rgb(0_0_0/0.3)]',
  secondary: 'border border-line-strong bg-surface-3 text-label hover:bg-surface-4',
  ghost: 'text-label-2 hover:bg-white/[0.06] hover:text-label',
}

export function StatusLink({
  variant = 'primary',
  className,
  children,
  ...props
}: LinkProps & { variant?: keyof typeof linkVariants; className?: string; children: ReactNode }) {
  return (
    <Link className={cn(linkBase, linkVariants[variant], className)} {...props}>
      {children}
    </Link>
  )
}

type StatusPageFrameProps = {
  icon: LucideIcon
  kicker: string
  code?: string
  title: string
  description: string
  children?: React.ReactNode
  className?: string
}

export function StatusPageFrame({
  icon: Icon,
  kicker,
  code,
  title,
  description,
  children,
  className,
}: StatusPageFrameProps) {
  return (
    <div className={cn('lspd-login', className)}>
      <div className="w-full max-w-[400px] text-center">
        <div className="lspd-login-emblem !mb-6 !h-20 !w-20">
          <Image src="/shield.webp" alt="LSPD" width={80} height={80} priority />
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-label-3">
          <Icon size={15} strokeWidth={1.75} aria-hidden />
          <span>{kicker}</span>
          {code && (
            <span className="font-mono tabular-nums text-label-4" aria-label={`Code ${code}`}>
              · {code}
            </span>
          )}
        </div>
        <h1 className="mt-1 text-[24px] font-bold tracking-[-0.025em] text-label">{title}</h1>
        <p className="mx-auto mt-2 max-w-[36ch] text-[14px] leading-relaxed text-label-2">{description}</p>
        {children}
        <p className="mt-6 text-[12px] text-label-4">LSPD Department · Los Santos Police Department</p>
      </div>
    </div>
  )
}
