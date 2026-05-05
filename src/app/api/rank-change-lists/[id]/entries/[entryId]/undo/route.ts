import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { findBadgeNumberConflict, releaseTerminatedBadgeNumberConflicts, sameBadgeNumber } from '@/lib/badge-blacklist'
import { queueDiscordHrEvent, queueOfficerRoleSync } from '@/lib/discord-integration'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['rank-change-lists:execute'])
    const { id, entryId } = await params

    const entry = await prisma.rankChangeListEntry.findFirst({
      where: { id: entryId, listId: id },
      include: {
        list: true,
        officer: true,
        currentRank: true,
        proposedRank: true,
      },
    })

    if (!entry) return error('Eintrag nicht gefunden', 404)
    if (entry.list.type !== 'PROMOTION') return error('Nur Beförderungen können hier rückgängig gemacht werden')
    if (!entry.executed) return error('Eintrag wurde noch nicht durchgeführt')
    if (entry.officer.status === 'TERMINATED') return error('Gekündigte Officers können nicht automatisch zurückgesetzt werden')
    if (entry.officer.rankId !== entry.proposedRankId) {
      return error('Officer hat inzwischen einen anderen Rang. Bitte manuell prüfen, bevor die Beförderung rückgängig gemacht wird')
    }

    const executedUntil = entry.executedAt ? new Date(entry.executedAt.getTime() + 60_000) : undefined
    const promotionLog = await prisma.promotionLog.findFirst({
      where: {
        officerId: entry.officerId,
        oldRankId: entry.currentRankId,
        newRankId: entry.proposedRankId,
        createdAt: entry.executedAt ? { gte: entry.createdAt, lte: executedUntil } : { gte: entry.createdAt },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!promotionLog?.oldBadgeNumber) {
      return error('Passender Beförderungs-Log wurde nicht gefunden. Rücknahme abgebrochen, damit keine falsche Dienstnummer gesetzt wird')
    }

    const prefix = await getBadgePrefix()
    const restoreBadgeNumber = promotionLog.oldBadgeNumber.trim()
    const expectedCurrentBadgeNumber = promotionLog.newBadgeNumber?.trim()

    if (
      expectedCurrentBadgeNumber &&
      !sameBadgeNumber(entry.officer.badgeNumber, expectedCurrentBadgeNumber, prefix)
    ) {
      return error('Dienstnummer wurde nach der Beförderung erneut geändert. Bitte manuell prüfen, bevor die Beförderung rückgängig gemacht wird')
    }

    if (!sameBadgeNumber(entry.officer.badgeNumber, restoreBadgeNumber, prefix)) {
      const badgeConflict = await findBadgeNumberConflict(restoreBadgeNumber, prefix, entry.officerId)
      if (badgeConflict) return error(`${badgeConflict}: ${restoreBadgeNumber}`)
      await releaseTerminatedBadgeNumberConflicts(restoreBadgeNumber, prefix)
    }

    await prisma.$transaction(async (tx) => {
      await tx.officer.update({
        where: { id: entry.officerId },
        data: {
          rankId: entry.currentRankId,
          badgeNumber: restoreBadgeNumber,
        },
      })

      await tx.rankChangeListEntry.update({
        where: { id: entry.id },
        data: {
          executed: false,
          executedAt: null,
        },
      })

      await tx.rankChangeList.update({
        where: { id: entry.listId },
        data: { status: 'DRAFT' },
      })
    })

    await createAuditLog({
      action: 'OFFICER_PROMOTION_REVERTED',
      userId: user.id,
      officerId: entry.officerId,
      oldValue: entry.proposedRank.name,
      newValue: entry.currentRank.name,
      details: `Beförderung aus "${entry.list.name}" rückgängig gemacht: ${entry.officer.firstName} ${entry.officer.lastName} – ${entry.proposedRank.name} → ${entry.currentRank.name}`,
    })

    queueOfficerRoleSync(entry.officerId)
    queueDiscordHrEvent({
      type: 'update',
      title: `Beförderung rückgängig: ${entry.officer.firstName} ${entry.officer.lastName}`,
      description: `Beförderung via Liste **${entry.list.name}** wurde rückgängig gemacht.`,
      officer: {
        ...entry.officer,
        badgeNumber: restoreBadgeNumber,
        rankId: entry.currentRankId,
        rank: entry.currentRank,
      },
      actor: user,
      fields: [
        { name: 'Zurückgesetzt von', value: entry.proposedRank.name, inline: true },
        { name: 'Zurückgesetzt auf', value: `**${entry.currentRank.name}**`, inline: true },
        { name: 'DN-Wechsel', value: `${entry.officer.badgeNumber} → **${restoreBadgeNumber}**`, inline: true },
      ],
    })

    return success({
      reverted: true,
      officerId: entry.officerId,
      rankId: entry.currentRankId,
      badgeNumber: restoreBadgeNumber,
    })
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Dienstnummer bereits vergeben')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
