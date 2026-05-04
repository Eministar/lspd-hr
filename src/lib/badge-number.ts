import type { Rank } from '@/generated/prisma/client'

/**
 * Liest die numerische Dienstnummer (ohne optionales Präfix aus den Einstellungen).
 */
export function parseBadgeNumberToInt(badgeNumber: string, prefix: string): number | null {
  const raw = badgeNumberRawDigits(badgeNumber, prefix)
  if (raw === null) return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function stripTerminatedBadgeNumber(badgeNumber: string) {
  const trimmed = badgeNumber.trim()
  const marker = '__terminated__'
  const markerIndex = trimmed.indexOf(marker)
  return markerIndex >= 0 ? trimmed.slice(0, markerIndex).trim() : trimmed
}

export function displayBadgeNumber(badgeNumber?: string | null) {
  const trimmed = badgeNumber?.trim() ?? ''
  if (!trimmed) return '—'
  return stripTerminatedBadgeNumber(trimmed)
}

function badgeNumberRawDigits(badgeNumber: string, prefix: string): string | null {
  const raw = (prefix && badgeNumber.startsWith(prefix) ? badgeNumber.slice(prefix.length) : badgeNumber).trim()
  if (!/^\d+$/.test(raw)) return null
  return raw
}

/**
 * Baut die Dienstnummer-String aus Zahl + optionalem Präfix.
 */
export function formatBadgeNumber(n: number, prefix: string): string {
  return prefix ? `${prefix}${n}` : String(n)
}

function formatBadgeNumberWithWidth(n: number, prefix: string, width: number): string {
  const value = width > 1 ? String(n).padStart(width, '0') : String(n)
  return prefix ? `${prefix}${value}` : value
}

/**
 * Sammelt alle belegten numerischen Dienstnummern (global, alle Officers).
 */
export function collectUsedBadgeInts(
  rows: { badgeNumber: string }[],
  prefix: string
): Set<number> {
  const used = new Set<number>()
  for (const row of rows) {
    const n = parseBadgeNumberToInt(row.badgeNumber, prefix)
    if (n !== null) used.add(n)
  }
  return used
}

/**
 * Sucht die kleinste freie Nummer in [min, max] (inklusiv), die nicht in `used` liegt.
 * Optional `excludeInt`: aktuelle Nummer des Officers, die bei Rangwechsel „frei“ wird, bevor neu vergeben wird.
 */
export function findNextFreeBadgeInRange(
  min: number,
  max: number,
  used: Set<number>,
  excludeInt: number | null
): number | null {
  if (min > max) return null
  const ex = new Set(used)
  if (excludeInt !== null) ex.delete(excludeInt)
  for (let n = min; n <= max; n++) {
    if (!ex.has(n)) return n
  }
  return null
}

export function rankHasBadgeRange(rank: Pick<Rank, 'badgeMin' | 'badgeMax'>): rank is { badgeMin: number; badgeMax: number } {
  return rank.badgeMin != null && rank.badgeMax != null && rank.badgeMin <= rank.badgeMax
}

/**
 * Liefert die nächste freie Dienstnummer für einen Rang, oder null wenn kein Bereich / voll.
 */
export function nextBadgeForRank(
  rank: Pick<Rank, 'badgeMin' | 'badgeMax'>,
  allOfficers: { badgeNumber: string }[],
  prefix: string,
  currentOfficerBadge?: string | null,
  reservedBadges: { badgeNumber: string }[] = []
): { num: number; str: string } | null {
  if (!rankHasBadgeRange(rank)) return null
  const used = collectUsedBadgeInts(allOfficers, prefix)
  const self = currentOfficerBadge ? parseBadgeNumberToInt(currentOfficerBadge, prefix) : null
  if (self !== null) used.delete(self)
  for (const reserved of reservedBadges) {
    const n = parseBadgeNumberToInt(reserved.badgeNumber, prefix)
    if (n !== null) used.add(n)
  }
  const n = findNextFreeBadgeInRange(rank.badgeMin, rank.badgeMax, used, null)
  if (n === null) return null
  let width = 0
  for (const row of [...allOfficers, ...reservedBadges]) {
    const raw = badgeNumberRawDigits(row.badgeNumber, prefix)
    if (raw === null) continue
    const value = parseInt(raw, 10)
    if (value >= rank.badgeMin && value <= rank.badgeMax && raw.length > width) {
      width = raw.length
    }
  }
  return { num: n, str: formatBadgeNumberWithWidth(n, prefix, width) }
}
