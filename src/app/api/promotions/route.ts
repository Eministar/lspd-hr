import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'

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

    const { officerId, newRankId, newBadgeNumber, note } = body
    if (!officerId || !newRankId) return error('Officer und neuer Rang sind erforderlich')

    const officer = await prisma.officer.findUnique({ where: { id: officerId }, include: { rank: true } })
    if (!officer) return error('Officer nicht gefunden')

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

    const newRank = await prisma.rank.findUnique({ where: { id: newRankId } })
    await createAuditLog({
      action: 'OFFICER_PROMOTED',
      userId: user.id,
      officerId,
      oldValue: officer.rank.name,
      newValue: newRank?.name || 'Unbekannt',
      details: `${officer.firstName} ${officer.lastName}: ${officer.rank.name} → ${newRank?.name}`,
    })

    return success(promotion, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
