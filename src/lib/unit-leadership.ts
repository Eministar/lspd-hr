import { prisma } from '@/lib/prisma'
import type { CurrentUser } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { officerUnitKeys } from '@/lib/officer-units'

function normalizedSet(value: string[]) {
  return new Set(value.map((item) => item.trim()).filter(Boolean))
}

function sameSet(a: string[], b: string[]) {
  const setA = normalizedSet(a)
  const setB = normalizedSet(b)
  if (setA.size !== setB.size) return false
  return Array.from(setA).every((item) => setB.has(item))
}

export function hasOfficerWriteAccess(user: CurrentUser) {
  if (hasPermission(user, 'officers:write')) return true
  return user.groups.some((group) => ['admin', 'administration', 'hr'].includes(group.name.toLowerCase()))
}

export async function getManagedUnitKeysForUser(user: CurrentUser): Promise<string[]> {
  if (!hasPermission(user, 'unit-leadership:manage') || !user.discordId) return []

  const linkedOfficer = await prisma.officer.findFirst({
    where: {
      discordId: user.discordId,
      status: { not: 'TERMINATED' },
    },
    select: {
      unit: true,
      units: true,
    },
  })

  return linkedOfficer ? officerUnitKeys(linkedOfficer) : []
}

export function unitLeadershipChangeError(existingUnits: string[], nextUnits: string[], managedUnits: string[]) {
  const managed = normalizedSet(managedUnits)
  if (managed.size === 0) return 'Keine verknüpfte Unit für Unit-Leitung'

  const existingUnmanaged = existingUnits.filter((key) => !managed.has(key))
  const nextUnmanaged = nextUnits.filter((key) => !managed.has(key))
  if (!sameSet(existingUnmanaged, nextUnmanaged)) {
    return 'Unit-Leitung darf nur eigene verknüpfte Units ändern'
  }

  return null
}
