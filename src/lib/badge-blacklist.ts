import { prisma } from './prisma'
import { parseBadgeNumberToInt } from './badge-number'

export function sameBadgeNumber(a: string, b: string, prefix: string) {
  const aTrimmed = a.trim()
  const bTrimmed = b.trim()
  if (aTrimmed.toLowerCase() === bTrimmed.toLowerCase()) return true

  const aInt = parseBadgeNumberToInt(aTrimmed, prefix)
  const bInt = parseBadgeNumberToInt(bTrimmed, prefix)
  return aInt !== null && bInt !== null && aInt === bInt
}

export async function getBlacklistedBadgeRows() {
  return prisma.badgeBlacklist.findMany({ select: { badgeNumber: true } })
}

export async function findBlacklistedBadgeNumber(badgeNumber: string, prefix: string) {
  const normalized = badgeNumber.trim()
  if (!normalized) return null

  const blacklisted = await prisma.badgeBlacklist.findMany({ select: { badgeNumber: true } })
  return blacklisted.find((row) => sameBadgeNumber(row.badgeNumber, normalized, prefix)) ?? null
}

export async function findBadgeNumberConflict(
  badgeNumber: string,
  prefix: string,
  currentOfficerId?: string | null,
) {
  const normalized = badgeNumber.trim()
  if (!normalized) return null

  const [officers, blacklisted] = await Promise.all([
    prisma.officer.findMany({ select: { id: true, badgeNumber: true } }),
    prisma.badgeBlacklist.findMany({ select: { badgeNumber: true } }),
  ])

  const officer = officers.find((row) => (
    row.id !== currentOfficerId && sameBadgeNumber(row.badgeNumber, normalized, prefix)
  ))
  if (officer) return 'Dienstnummer bereits vergeben'

  const blocked = blacklisted.find((row) => sameBadgeNumber(row.badgeNumber, normalized, prefix))
  if (blocked) return 'Dienstnummer ist gesperrt'

  return null
}
