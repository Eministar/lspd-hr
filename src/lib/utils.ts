import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('de-DE', { 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Aktiv',
    AWAY: 'Abgemeldet',
    INACTIVE: 'Inaktiv',
    TERMINATED: 'Gekündigt',
  }
  return labels[status] || status
}

export function getStatusDot(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-[#34d399]',
    AWAY: 'bg-[#fbbf24]',
    INACTIVE: 'bg-[#aaa]',
    TERMINATED: 'bg-[#f87171]',
  }
  return colors[status] || 'bg-[#aaa]'
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: 'text-[#111] dark:text-[#eee]',
    AWAY: 'text-[#888]',
    INACTIVE: 'text-[#aaa]',
    TERMINATED: 'text-[#aaa]',
  }
  return colors[status] || 'text-[#888]'
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: 'Administrator',
    HR: 'HR',
    LEADERSHIP: 'Führungsebene',
    READONLY: 'Nur Lesen',
  }
  return labels[role] || role
}
