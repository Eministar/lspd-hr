import type { Rank } from '@/generated/prisma/client'

/**
 * Liest die numerische Dienstnummer (ohne optionales Präfix aus den Einstellungen).
 */
export function parseBadgeNumberToInt(badgeNumber: string, prefix: string): number | null {
  const raw = prefix && badgeNumber.startsWith(prefix) ? badgeNumber.slice(prefix.length) : badgeNumber
  const n = parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Baut die Dienstnummer-String aus Zahl + optionalem Präfix.
 */
export function formatBadgeNumber(n: number, prefix: string): string {
  return prefix ? `${prefix}${n}` : String(n)
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
  currentOfficerBadge: string
): { num: number; str: string } | null {
  if (!rankHasBadgeRange(rank)) return null
  const used = collectUsedBadgeInts(allOfficers, prefix)
  const self = parseBadgeNumberToInt(currentOfficerBadge, prefix)
  const n = findNextFreeBadgeInRange(rank.badgeMin, rank.badgeMax, used, self)
  if (n === null) return null
  return { num: n, str: formatBadgeNumber(n, prefix) }
}
