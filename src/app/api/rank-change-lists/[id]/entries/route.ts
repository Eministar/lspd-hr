import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { nextBadgeForRank, rankHasBadgeRange } from '@/lib/badge-number'
import { findBadgeNumberConflict, getBlacklistedBadgeRows } from '@/lib/badge-blacklist'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN', 'HR'], ['rank-changes:manage'])
    const { id } = await params
    const body = await req.json()

    const { officerId, proposedRankId, newBadgeNumber, note } = body
    if (!officerId || !proposedRankId) return error('Officer und vorgeschlagener Rang sind erforderlich')

    const list = await prisma.rankChangeList.findUnique({ where: { id } })
    if (!list) return error('Liste nicht gefunden', 404)
    if (list.status === 'COMPLETED') return error('Liste ist bereits abgeschlossen')

    const officer = await prisma.officer.findUnique({ where: { id: officerId } })
    if (!officer) return error('Officer nicht gefunden')
    const proposedRank = await prisma.rank.findUnique({ where: { id: proposedRankId } })
    if (!proposedRank) return error('Vorgeschlagener Rang nicht gefunden')

    const existing = await prisma.rankChangeListEntry.findUnique({
      where: { listId_officerId: { listId: id, officerId } },
    })
    if (existing) return error('Officer ist bereits in dieser Liste')

    let nextBadge = typeof newBadgeNumber === 'string' ? newBadgeNumber.trim() : ''
    const prefix = await getBadgePrefix()
    if (!nextBadge && rankHasBadgeRange(proposedRank)) {
      const allRows = await prisma.officer.findMany({ select: { badgeNumber: true } })
      const blacklistedBadges = await getBlacklistedBadgeRows()
      const pendingBadges = await prisma.rankChangeListEntry.findMany({
        where: { listId: id, executed: false, newBadgeNumber: { not: null } },
        select: { newBadgeNumber: true },
      })
      const assigned = nextBadgeForRank(
        proposedRank,
        [
          ...allRows,
          ...pendingBadges
            .map((entry) => entry.newBadgeNumber)
            .filter((badgeNumber): badgeNumber is string => !!badgeNumber)
            .map((badgeNumber) => ({ badgeNumber })),
        ],
        prefix,
        officer.badgeNumber,
        blacklistedBadges,
      )
      if (!assigned) return error('Keine freie Dienstnummer im Bereich des vorgeschlagenen Rangs')
      nextBadge = assigned.str
    }
    if (nextBadge && nextBadge !== officer.badgeNumber) {
      const badgeConflict = await findBadgeNumberConflict(nextBadge, prefix, officerId)
      if (badgeConflict) return error(badgeConflict)
      const badgeInList = await prisma.rankChangeListEntry.findFirst({
        where: {
          listId: id,
          newBadgeNumber: nextBadge,
          executed: false,
        },
      })
      if (badgeInList) return error('Dienstnummer ist bereits in dieser Liste vorgesehen')
    }

    const entry = await prisma.rankChangeListEntry.create({
      data: {
        listId: id,
        officerId,
        currentRankId: officer.rankId,
        proposedRankId,
        newBadgeNumber: nextBadge || null,
        note: note || null,
      },
      include: {
        officer: { select: { firstName: true, lastName: true, badgeNumber: true } },
        currentRank: { select: { name: true, color: true } },
        proposedRank: { select: { name: true, color: true } },
      },
    })

    return success(entry, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN', 'HR'], ['rank-changes:manage'])
    const { id } = await params
    const { entryId } = await req.json()

    if (!entryId) return error('Entry ID ist erforderlich')

    await prisma.rankChangeListEntry.delete({ where: { id: entryId, listId: id } })
    return success({ deleted: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
