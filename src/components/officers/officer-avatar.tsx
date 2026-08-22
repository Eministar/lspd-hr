'use client'

import { UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

type OfficerAvatarProps = {
  officer: {
    firstName: string
    lastName: string
    avatarUrl?: string | null
  }
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  ringColor?: string | null
}

const sizeClasses = {
  xs: 'h-[26px] w-[26px]',
  sm: 'h-[30px] w-[30px]',
  md: 'h-9 w-9',
  lg: 'h-14 w-14',
}

const iconSizes = { xs: 12, sm: 13, md: 15, lg: 21 }

export function OfficerAvatar({ officer, size = 'md', className, ringColor }: OfficerAvatarProps) {
  const label = `Discord-Profilbild von ${officer.firstName} ${officer.lastName}`
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border bg-[#102542] bg-cover bg-center text-[#8ea4bd] shadow-[0_2px_8px_rgba(0,0,0,.18)]',
        sizeClasses[size],
        className,
      )}
      style={{
        borderColor: ringColor ? `${ringColor}66` : 'rgba(74,101,133,.7)',
        backgroundImage: officer.avatarUrl ? `url(${officer.avatarUrl})` : undefined,
      }}
    >
      {!officer.avatarUrl && <UserRound size={iconSizes[size]} strokeWidth={1.8} aria-hidden />}
    </span>
  )
}
