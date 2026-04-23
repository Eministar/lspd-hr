import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'])
    const { id } = await params

    const list = await prisma.rankChangeList.findUnique({
      where: { id },
      include: {
        entries: {
          where: { executed: false },
          include: {
            officer: true,
            currentRank: true,
            proposedRank: true,
          },
        },
      },
    })

    if (!list) return error('Liste nicht gefunden', 404)
    if (list.entries.length === 0) return error('Keine offenen Einträge vorhanden')

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

    await prisma.rankChangeList.update({
      where: { id },
      data: { status: 'COMPLETED' },
    })

    return success({ executed, total: list.entries.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
