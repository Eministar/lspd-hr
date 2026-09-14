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

export function formatRelativeTime(date: Date | string | null | undefined, now: Date = new Date()): string {
  if (!date) return '—'
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  if (!Number.isFinite(diffMs)) return '—'
  if (diffMs < 0) return 'gerade eben'
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 45) return 'gerade eben'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `vor ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  if (days < 7) return `vor ${days}d`
  return formatDate(d)
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
    ACTIVE: 'bg-green',
    AWAY: 'bg-cyan',
    INACTIVE: 'bg-label-3',
    TERMINATED: 'bg-red',
  }
  return colors[status] || 'bg-label-3'
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: 'text-label dark:text-label',
    AWAY: 'text-label-2',
    INACTIVE: 'text-label-3',
    TERMINATED: 'text-label-3',
  }
  return colors[status] || 'text-label-2'
}

export function getUnitLabel(unit: string | null | undefined): string {
  if (!unit) return '—'
  const labels: Record<string, string> = {
    HR_LEITUNG: 'HR Leitung',
    HR_TRAINEE: 'HR Trainee',
    HR_OFFICER: 'HR Officer',
    ACADEMY: 'Recruitment & Training',
    SRU: 'S.R.U.',
    AIR_SUPPORT: 'Air-Support Division',
  }
  return labels[unit] || unit
}

export function getUnitBadgeClass(unit: string | null | undefined): string {
  const map: Record<string, string> = {
    HR_LEITUNG: 'bg-purple/15 text-purple border-transparent',
    HR_TRAINEE: 'bg-blue/15 text-blue border-transparent',
    HR_OFFICER: 'bg-cyan/15 text-cyan border-transparent',
    ACADEMY: 'bg-gold/15 text-gold-bright border-transparent',
    SRU: 'bg-red/15 text-red border-transparent',
    AIR_SUPPORT: 'bg-cyan/15 text-cyan border-transparent',
  }
  if (!unit) return 'bg-transparent text-label-4 border-transparent'
  return map[unit] || 'bg-white/[0.07] text-label-2 border-transparent'
}

/**
 * Markierungen / Flags für Officers (rot/orange/gelb). Gibt einen Tooltip-Label,
 * eine Punkt-Farbe und eine leichte Hintergrund-Tönung für die ganze Zeile zurück.
 */
export function getFlagLabel(flag: string | null | undefined): string {
  if (!flag) return 'Keine Markierung'
  const labels: Record<string, string> = {
    RED: 'Rot',
    ORANGE: 'Orange',
    YELLOW: 'Gelb',
    BLUE: 'Blau',
  }
  return labels[flag] || flag
}

export function getFlagColor(flag: string | null | undefined): string {
  if (!flag) return 'transparent'
  const colors: Record<string, string> = {
    RED: '#ff453a',
    ORANGE: '#ff9f0a',
    YELLOW: '#ffd60a',
    BLUE: '#64d2ff',
  }
  return colors[flag] || 'transparent'
}

export function getFlagDotClass(flag: string | null | undefined): string {
  const map: Record<string, string> = {
    RED: 'bg-red',
    ORANGE: 'bg-orange',
    YELLOW: 'bg-yellow',
    BLUE: 'bg-cyan',
  }
  if (!flag) return 'bg-transparent'
  return map[flag] || 'bg-transparent'
}

export function getFlagRowClass(flag: string | null | undefined): string {
  const map: Record<string, string> = {
    RED: 'bg-[rgba(255,69,58,0.07)] hover:bg-[rgba(255,69,58,0.12)]',
    ORANGE: 'bg-[rgba(255,159,10,0.07)] hover:bg-[rgba(255,159,10,0.12)]',
    YELLOW: 'bg-[rgba(255,214,10,0.07)] hover:bg-[rgba(255,214,10,0.12)]',
    BLUE: 'bg-[rgba(100,210,255,0.07)] hover:bg-[rgba(100,210,255,0.12)]',
  }
  if (!flag) return ''
  return map[flag] || ''
}

/**
 * Stabile, numerische Sortierung von Dienstnummern. Nicht-numerische Bestandteile
 * (z. B. ein Präfix wie "LSPD-") werden nach hinten gestellt; bei gleicher Zahl wird
 * lexikographisch verglichen, damit Reihenfolge deterministisch bleibt.
 */
export function compareBadgeNumbers(a: string, b: string): number {
  const na = parseInt((a.match(/\d+/)?.[0] ?? ''), 10)
  const nb = parseInt((b.match(/\d+/)?.[0] ?? ''), 10)
  const aHas = Number.isFinite(na)
  const bHas = Number.isFinite(nb)
  if (aHas && bHas && na !== nb) return na - nb
  if (aHas && !bHas) return -1
  if (!aHas && bHas) return 1
  return a.localeCompare(b, 'de')
}
