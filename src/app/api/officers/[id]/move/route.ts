import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { nextBadgeForRank, rankHasBadgeRange } from '@/lib/badge-number'
import { getBlacklistedBadgeRows } from '@/lib/badge-blacklist'
import { createAuditLog } from '@/lib/audit'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { queueDiscordHrEvent, queueOfficerRoleSync } from '@/lib/discord-integration'

const includeOfficer = {
  rank: true,
  trainings: { include: { training: true } },
} as const

/**
 * Office zwischen Rängen verschieben (z. B. per Drag & Drop). Vergibt ggf. eine freie
 * Dienstnummer gemäß Ziel-Badge-Bereich, sonst behält die bisherige Nummer.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['rank-changes:manage'])
    const { id } = await params
    const body = await req.json()
    const targetRankId = body?.targetRankId as string | undefined
    if (!targetRankId) return error('Ziel-Rang fehlt')

    const officer = await prisma.officer.findUnique({ where: { id }, include: { rank: true } })
    if (!officer) return notFound('Officer')

    if (officer.rankId === targetRankId) {
      const same = await prisma.officer.findUnique({ where: { id }, include: includeOfficer })
      return success(same)
    }

    const targetRank = await prisma.rank.findUnique({ where: { id: targetRankId } })
    if (!targetRank) return error('Ziel-Rang nicht gefunden')

    const prefix = await getBadgePrefix()
    // Exclude terminated officers so their badge numbers are free for reassignment
    const allForBadges = await prisma.officer.findMany({ where: { status: { not: 'TERMINATED' } }, select: { badgeNumber: true } })
    const blacklistedBadges = await getBlacklistedBadgeRows()

    let newBadge = officer.badgeNumber
    if (rankHasBadgeRange(targetRank)) {
      const assigned = nextBadgeForRank(targetRank, allForBadges, prefix, officer.badgeNumber, blacklistedBadges)
      if (!assigned) return error('Keine freie Dienstnummer im Ziel-Bereich für diesen Rang')
      newBadge = assigned.str
    }

    const promotion = await prisma.promotionLog.create({
      data: {
        officerId: id,
        oldRankId: officer.rankId,
        newRankId: targetRankId,
        oldBadgeNumber: officer.badgeNumber,
        newBadgeNumber: newBadge,
        performedByUserId: user.id,
        note: 'Verschiebung (Roster)',
      },
    })

    const updated = await prisma.officer.update({
      where: { id },
      data: { rankId: targetRankId, badgeNumber: newBadge },
      include: includeOfficer,
    })

    await createAuditLog({
      action: 'OFFICER_PROMOTED',
      userId: user.id,
      officerId: id,
      oldValue: officer.rank.name,
      newValue: targetRank.name,
      details: `${officer.firstName} ${officer.lastName}: ${officer.badgeNumber} → ${newBadge} · ${officer.rank.name} → ${targetRank.name}`,
    })

    queueOfficerRoleSync(id)
    queueDiscordHrEvent({
      type: 'promotion',
      title: `${targetRank.sortOrder < officer.rank.sortOrder ? 'Beförderung' : 'Rangänderung'}: ${officer.firstName} ${officer.lastName}`,
      description: 'Roster-Verschiebung erfolgreich durchgeführt.',
      officer: updated,
      actor: user,
      fields: [
        { name: '⬅️ Alter Rang', value: officer.rank.name, inline: true },
        { name: '➡️ Neuer Rang', value: targetRank.name, inline: true },
        { name: '🔁 Dienstnummer-Wechsel', value: `${officer.badgeNumber} → ${newBadge}`, inline: true },
        { name: '📅 Gültig ab', value: promotion.createdAt.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }), inline: true },
      ],
    })

    return success(updated)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Dienstnummer bereits vergeben')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
