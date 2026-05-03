import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { nextBadgeForRank, rankHasBadgeRange } from '@/lib/badge-number'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { findBadgeNumberConflict, getBlacklistedBadgeRows } from '@/lib/badge-blacklist'
import { queueDiscordHrEvent, queueOfficerRoleSync } from '@/lib/discord-integration'

export async function GET() {
  try {
    await requirePermission('rank-changes:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }

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
    const user = await requireAuth(['ADMIN', 'HR'], ['rank-changes:manage'])
    const body = await req.json()

    const { officerId, newRankId, newBadgeNumber: bodyBadge, note } = body
    if (!officerId || !newRankId) return error('Officer und neuer Rang sind erforderlich')

    const officer = await prisma.officer.findUnique({ where: { id: officerId }, include: { rank: true } })
    if (!officer) return error('Officer nicht gefunden')

    const newRank = await prisma.rank.findUnique({ where: { id: newRankId } })
    if (!newRank) return error('Rang nicht gefunden')

    let newBadgeNumber: string = typeof bodyBadge === 'string' && bodyBadge.trim() ? bodyBadge.trim() : ''
    const prefix = await getBadgePrefix()

    if (!newBadgeNumber) {
      if (rankHasBadgeRange(newRank)) {
        const allRows = await prisma.officer.findMany({ select: { badgeNumber: true } })
        const blacklistedBadges = await getBlacklistedBadgeRows()
        const assigned = nextBadgeForRank(newRank, allRows, prefix, officer.badgeNumber, blacklistedBadges)
        if (!assigned) return error('Keine freie Dienstnummer im Bereich des Ziel-Rangs')
        newBadgeNumber = assigned.str
      } else {
        newBadgeNumber = officer.badgeNumber
      }
    }

    if (newBadgeNumber && newBadgeNumber !== officer.badgeNumber) {
      const badgeConflict = await findBadgeNumberConflict(newBadgeNumber, prefix, officerId)
      if (badgeConflict) return error(badgeConflict)
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

    const updatedOfficer = await prisma.officer.update({
      where: { id: officerId },
      data: {
        rankId: newRankId,
        badgeNumber: newBadgeNumber || officer.badgeNumber,
      },
      include: { rank: true },
    })

    await createAuditLog({
      action: 'OFFICER_PROMOTED',
      userId: user.id,
      officerId,
      oldValue: officer.rank.name,
      newValue: newRank.name,
      details: `${officer.firstName} ${officer.lastName}: ${officer.rank.name} → ${newRank.name}`,
    })

    queueOfficerRoleSync(officerId)
    queueDiscordHrEvent({
      type: 'promotion',
      title: `${newRank.sortOrder < officer.rank.sortOrder ? 'Beförderung' : 'Rangänderung'}: ${officer.firstName} ${officer.lastName}`,
      description: note ? `📝 ${note}` : 'Rangänderung erfolgreich durchgeführt.',
      officer: updatedOfficer,
      actor: user,
      fields: [
        { name: '⬅️ Alter Rang', value: officer.rank.name, inline: true },
        { name: '➡️ Neuer Rang', value: newRank.name, inline: true },
        { name: '🔁 Dienstnummer-Wechsel', value: `${officer.badgeNumber} → ${newBadgeNumber || officer.badgeNumber}`, inline: true },
        { name: '📅 Gültig ab', value: promotion.createdAt.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }), inline: true },
      ],
    })

    return success(promotion, 201)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Neue Dienstnummer bereits vergeben')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
