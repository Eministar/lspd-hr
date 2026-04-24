'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link, { type LinkProps } from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const linkBase =
  'inline-flex w-full h-[38px] items-center justify-center rounded-[9px] text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426] active:scale-[0.98]'

const linkVariants = {
  primary:
    'bg-gradient-to-b from-[#d4af37] to-[#c29d32] text-[#071b33] shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-[#dcba48] hover:to-[#d4af37]',
  secondary:
    'bg-[#102542] text-[#edf4fb] shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:bg-[#17375f]',
  ghost: 'text-[#9fb0c4] hover:text-white hover:bg-[#102542]/70 h-[38px] rounded-[9px]',
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
    <div
      className={cn(
        'min-h-screen flex items-center justify-center bg-[#061426] p-4 relative overflow-hidden bg-pattern',
        className
      )}
    >
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-[-40%] left-[-20%] w-[80%] h-[80%] rounded-full bg-[#d4af37]/[0.03] blur-[100px]" />
        <div className="absolute bottom-[-30%] right-[-10%] w-[60%] h-[60%] rounded-full bg-[#071b33]/[0.04] blur-[80px]" />
      </div>
      <div className="w-full max-w-[420px] glass-panel-elevated rounded-[18px] p-6 text-center relative z-10">
        <div className="mx-auto mb-5 flex h-[88px] w-[88px] items-center justify-center rounded-[20px] bg-gradient-to-br from-[#0a2040] to-[#071833] border border-[#d4af37]/30 shadow-[0_4px_20px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(212,175,55,0.08)]">
          <Image src="/shield.webp" alt="LSPD" width={72} height={72} className="rounded-full" priority />
        </div>
        <div className="mb-2 flex items-center justify-center gap-2 text-[#d4af37]">
          <Icon size={17} strokeWidth={1.8} aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{kicker}</span>
          {code && (
            <span className="text-[11px] font-mono text-[#6b8299] tabular-nums" aria-label={`Code ${code}`}>
              · {code}
            </span>
          )}
        </div>
        <h1 className="text-[20px] font-semibold text-white">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#9fb0c4]">{description}</p>
        {children}
        <p className="mt-5 text-[11px] text-[#4a6585]">LSPD HR · Los Santos Police Department</p>
      </div>
    </div>
  )
}
