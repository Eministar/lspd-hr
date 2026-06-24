import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { formatBadgeNumber, parseBadgeNumberToInt, rankHasBadgeRange } from '@/lib/badge-number'
import { getBlacklistedBadgeRows } from '@/lib/badge-blacklist'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { queueOfficerRoleSync } from '@/lib/discord-integration'

type PlannedBadgeChange = {
  officerId: string
  officerName: string
  rankName: string
  oldBadgeNumber: string
  newBadgeNumber: string
}

export async function POST(_req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN'], ['ranks:manage'])
    const prefix = await getBadgePrefix()

    const [officers, blacklistedBadges] = await Promise.all([
      prisma.officer.findMany({
        where: { status: { not: 'TERMINATED' } },
        include: { rank: true },
        orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }, { createdAt: 'asc' }],
      }),
      getBlacklistedBadgeRows(),
    ])

    const reserved = new Set<number>()
    for (const blacklistedBadge of blacklistedBadges) {
      const n = parseBadgeNumberToInt(blacklistedBadge.badgeNumber, prefix)
      if (n !== null) reserved.add(n)
    }
    for (const officer of officers) {
      if (rankHasBadgeRange(officer.rank)) continue
      const n = parseBadgeNumberToInt(officer.badgeNumber, prefix)
      if (n !== null) reserved.add(n)
    }

    const changes: PlannedBadgeChange[] = []
    for (const officer of officers) {
      if (!rankHasBadgeRange(officer.rank)) continue

      let nextNumber: number | null = null
      for (let n = officer.rank.badgeMin; n <= officer.rank.badgeMax; n++) {
        if (!reserved.has(n)) {
          nextNumber = n
          break
        }
      }

      if (nextNumber === null) {
        return error(`Nicht genug freie Dienstnummern im Bereich ${officer.rank.badgeMin}-${officer.rank.badgeMax} für ${officer.rank.name}`)
      }

      reserved.add(nextNumber)
      const newBadgeNumber = formatBadgeNumber(nextNumber, prefix)
      if (newBadgeNumber !== officer.badgeNumber) {
        changes.push({
          officerId: officer.id,
          officerName: `${officer.firstName} ${officer.lastName}`,
          rankName: officer.rank.name,
          oldBadgeNumber: officer.badgeNumber,
          newBadgeNumber,
        })
      }
    }

    if (changes.length === 0) {
      return success({ updated: 0, changes: [] })
    }

    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        await tx.officer.update({
          where: { id: change.officerId },
          data: { badgeNumber: change.newBadgeNumber },
        })
        await tx.auditLog.create({
          data: {
            action: 'OFFICER_BADGE_REASSIGNED',
            userId: user.id,
            officerId: change.officerId,
            oldValue: change.oldBadgeNumber,
            newValue: change.newBadgeNumber,
            details: `${change.officerName}: ${change.oldBadgeNumber} -> ${change.newBadgeNumber} (${change.rankName})`,
          },
        })
      }
    })

    await createAuditLog({
      action: 'BADGE_NUMBERS_REASSIGNED',
      userId: user.id,
      details: `${changes.length} Dienstnummern anhand der Rangbereiche neu vergeben`,
    })

    for (const change of changes) {
      queueOfficerRoleSync(change.officerId)
    }

    return success({ updated: changes.length, changes })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
