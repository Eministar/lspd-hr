import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { nextBadgeForRank, rankHasBadgeRange } from '@/lib/badge-number'
import { notifyDiscordBot } from '@/lib/discord/notifier'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const promotions = await prisma.promotionLog.findMany({
    include: {
      officer: { select: { firstName: true, lastName: true, badgeNumber: true } },
      oldRank: true,
      newRank: true,
      performedBy: { select: { displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return success(promotions)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'])
    const body = await req.json()

    const { officerId, newRankId, newBadgeNumber: bodyBadge, note } = body
    if (!officerId || !newRankId) return error('Officer und neuer Rang sind erforderlich')

    const officer = await prisma.officer.findUnique({ where: { id: officerId }, include: { rank: true } })
    if (!officer) return error('Officer nicht gefunden')

    const newRank = await prisma.rank.findUnique({ where: { id: newRankId } })
    if (!newRank) return error('Rang nicht gefunden')

    let newBadgeNumber: string = typeof bodyBadge === 'string' && bodyBadge.trim() ? bodyBadge.trim() : ''

    if (!newBadgeNumber) {
      if (rankHasBadgeRange(newRank)) {
        const prefix = await getBadgePrefix()
        const allRows = await prisma.officer.findMany({ select: { badgeNumber: true } })
        const assigned = nextBadgeForRank(newRank, allRows, prefix, officer.badgeNumber)
        if (!assigned) return error('Keine freie Dienstnummer im Bereich des Ziel-Rangs')
        newBadgeNumber = assigned.str
      } else {
        newBadgeNumber = officer.badgeNumber
      }
    }

    if (newBadgeNumber && newBadgeNumber !== officer.badgeNumber) {
      const dup = await prisma.officer.findUnique({ where: { badgeNumber: newBadgeNumber } })
      if (dup) return error('Neue Dienstnummer bereits vergeben')
    }

    const promotion = await prisma.promotionLog.create({
      data: {
        officerId,
        oldRankId: officer.rankId,
        newRankId,
        oldBadgeNumber: officer.badgeNumber,
        newBadgeNumber: newBadgeNumber || officer.badgeNumber,
        performedByUserId: user.id,
        note: note || null,
      },
    })

    await prisma.officer.update({
      where: { id: officerId },
      data: {
        rankId: newRankId,
        badgeNumber: newBadgeNumber || officer.badgeNumber,
      },
    })

    await createAuditLog({
      action: 'OFFICER_PROMOTED',
      userId: user.id,
      officerId,
      oldValue: officer.rank.name,
      newValue: newRank.name,
      details: `${officer.firstName} ${officer.lastName}: ${officer.rank.name} → ${newRank.name}`,
    })

    const isPromotion = newRank.sortOrder > officer.rank.sortOrder
    void notifyDiscordBot({
      type: isPromotion ? 'OFFICER_PROMOTED' : 'OFFICER_DEMOTED',
      officerId,
      actorDisplayName: user.displayName,
      oldRankName: officer.rank.name,
      newRankName: newRank.name,
      note: note || undefined,
    })

    return success(promotion, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
