import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { collectUsedBadgeInts, findNextFreeBadgeInRange, formatBadgeNumber, parseBadgeNumberToInt, rankHasBadgeRange } from '@/lib/badge-number'
import { findBadgeNumberConflict, getBlacklistedBadgeRows } from '@/lib/badge-blacklist'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['rank-changes:manage'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const entryId = typeof body.entryId === 'string' ? body.entryId : null

    const list = await prisma.rankChangeList.findUnique({
      where: { id },
      include: {
        entries: {
          where: entryId ? { id: entryId, executed: false } : { executed: false },
          include: {
            officer: true,
            currentRank: true,
            proposedRank: true,
          },
        },
      },
    })

    if (!list) return error('Liste nicht gefunden', 404)
    if (list.entries.length === 0) {
      return error(entryId ? 'Eintrag nicht gefunden oder bereits durchgeführt' : 'Keine offenen Einträge vorhanden')
    }

    const prefix = await getBadgePrefix()
    const allRows = await prisma.officer.findMany({ select: { badgeNumber: true } })
    const blacklistedBadges = await getBlacklistedBadgeRows()
    const usedBadgeInts = collectUsedBadgeInts(allRows, prefix)
    for (const blacklistedBadge of blacklistedBadges) {
      const n = parseBadgeNumberToInt(blacklistedBadge.badgeNumber, prefix)
      if (n !== null) usedBadgeInts.add(n)
    }
    const requestedBadges = new Map<string, string>()
    for (const entry of list.entries) {
      let nextBadge = entry.newBadgeNumber?.trim() ?? ''
      if (!nextBadge && rankHasBadgeRange(entry.proposedRank)) {
        const current = parseBadgeNumberToInt(entry.officer.badgeNumber, prefix)
        const assigned = findNextFreeBadgeInRange(entry.proposedRank.badgeMin, entry.proposedRank.badgeMax, usedBadgeInts, current)
        if (assigned === null) return error(`Keine freie Dienstnummer im Bereich für ${entry.officer.firstName} ${entry.officer.lastName}`)
        nextBadge = formatBadgeNumber(assigned, prefix)
        usedBadgeInts.add(assigned)
      }
      if (!nextBadge || nextBadge === entry.officer.badgeNumber) continue
      const badgeConflict = await findBadgeNumberConflict(nextBadge, prefix, entry.officerId)
      if (badgeConflict) return error(`${badgeConflict}: ${nextBadge}`)
      const duplicateEntry = requestedBadges.get(nextBadge)
      if (duplicateEntry) {
        return error(`Dienstnummer ${nextBadge} ist mehrfach in dieser Liste vorgesehen`)
      }
      requestedBadges.set(nextBadge, entry.officerId)

      const owner = await prisma.officer.findUnique({ where: { badgeNumber: nextBadge } })
      if (owner && owner.id !== entry.officerId) return error(`Dienstnummer ${nextBadge} ist bereits vergeben`)
      entry.newBadgeNumber = nextBadge
    }

    let executed = 0

    for (const entry of list.entries) {
      if (entry.officer.status === 'TERMINATED') continue

      await prisma.promotionLog.create({
        data: {
          officerId: entry.officerId,
          oldRankId: entry.currentRankId,
          newRankId: entry.proposedRankId,
          oldBadgeNumber: entry.officer.badgeNumber,
          newBadgeNumber: entry.newBadgeNumber || entry.officer.badgeNumber,
          performedByUserId: user.id,
          note: entry.note ? `[${list.name}] ${entry.note}` : `[${list.name}]`,
        },
      })

      await prisma.officer.update({
        where: { id: entry.officerId },
        data: {
          rankId: entry.proposedRankId,
          badgeNumber: entry.newBadgeNumber || entry.officer.badgeNumber,
        },
      })

      await prisma.rankChangeListEntry.update({
        where: { id: entry.id },
        data: { executed: true, executedAt: new Date() },
      })

      const action = list.type === 'DEMOTION' ? 'Degradierung' : 'Beförderung'
      await createAuditLog({
        action: 'OFFICER_PROMOTED',
        userId: user.id,
        officerId: entry.officerId,
        oldValue: entry.currentRank.name,
        newValue: entry.proposedRank.name,
        details: `${action} via "${list.name}": ${entry.officer.firstName} ${entry.officer.lastName} – ${entry.currentRank.name} → ${entry.proposedRank.name}`,
      })

      executed++
    }

    const remainingEntries = entryId
      ? await prisma.rankChangeListEntry.count({ where: { listId: id, executed: false } })
      : 0

    if (remainingEntries === 0) {
      await prisma.rankChangeList.update({
        where: { id },
        data: { status: 'COMPLETED' },
      })
    }

    return success({ executed, total: list.entries.length })
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Dienstnummer bereits vergeben')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
