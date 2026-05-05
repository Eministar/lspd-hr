import { prisma } from './prisma'
import type { CurrentUser } from './auth'
import { createAuditLog } from './audit'
import { getBadgePrefix } from './settings-helpers'
import { findBadgeNumberConflict, releaseTerminatedBadgeNumberConflicts, sameBadgeNumber } from './badge-blacklist'
import { queueDiscordHrEvent, queueOfficerRoleSync } from './discord-integration'

export type UndoPromotionListEntryData = {
  reverted: true
  officerId: string
  rankId: string
  badgeNumber: string
}

type UndoPromotionListEntryResult =
  | { ok: true; data: UndoPromotionListEntryData }
  | { ok: false; message: string; status?: number }

export async function undoPromotionListEntry(
  listId: string,
  entryId: string,
  user: Pick<CurrentUser, 'id' | 'displayName' | 'discordId'>,
): Promise<UndoPromotionListEntryResult> {
  const entry = await prisma.rankChangeListEntry.findFirst({
    where: { id: entryId, listId },
    include: {
      list: true,
      officer: true,
      currentRank: true,
      proposedRank: true,
    },
  })

  if (!entry) return { ok: false, message: 'Eintrag nicht gefunden', status: 404 }
  if (entry.list.type !== 'PROMOTION') {
    return { ok: false, message: 'Nur Beförderungen können hier rückgängig gemacht werden' }
  }
  if (!entry.executed) return { ok: false, message: 'Eintrag wurde noch nicht durchgeführt' }
  if (entry.officer.status === 'TERMINATED') {
    return { ok: false, message: 'Gekündigte Officers können nicht automatisch zurückgesetzt werden' }
  }
  if (entry.officer.rankId !== entry.proposedRankId) {
    return {
      ok: false,
      message: 'Officer hat inzwischen einen anderen Rang. Bitte manuell prüfen, bevor die Beförderung rückgängig gemacht wird',
    }
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
    return {
      ok: false,
      message: 'Passender Beförderungs-Log wurde nicht gefunden. Rücknahme abgebrochen, damit keine falsche Dienstnummer gesetzt wird',
    }
  }

  const prefix = await getBadgePrefix()
  const restoreBadgeNumber = promotionLog.oldBadgeNumber.trim()
  const expectedCurrentBadgeNumber = promotionLog.newBadgeNumber?.trim()

  if (
    expectedCurrentBadgeNumber &&
    !sameBadgeNumber(entry.officer.badgeNumber, expectedCurrentBadgeNumber, prefix)
  ) {
    return {
      ok: false,
      message: 'Dienstnummer wurde nach der Beförderung erneut geändert. Bitte manuell prüfen, bevor die Beförderung rückgängig gemacht wird',
    }
  }

  if (!sameBadgeNumber(entry.officer.badgeNumber, restoreBadgeNumber, prefix)) {
    const badgeConflict = await findBadgeNumberConflict(restoreBadgeNumber, prefix, entry.officerId)
    if (badgeConflict) return { ok: false, message: `${badgeConflict}: ${restoreBadgeNumber}` }
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
    details: `Beförderung aus "${entry.list.name}" rückgängig gemacht: ${entry.officer.firstName} ${entry.officer.lastName} - ${entry.proposedRank.name} -> ${entry.currentRank.name}`,
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
      { name: 'DN-Wechsel', value: `${entry.officer.badgeNumber} -> **${restoreBadgeNumber}**`, inline: true },
    ],
  })

  return {
    ok: true,
    data: {
      reverted: true,
      officerId: entry.officerId,
      rankId: entry.currentRankId,
      badgeNumber: restoreBadgeNumber,
    },
  }
}
