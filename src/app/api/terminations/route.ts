import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { notifyDiscordBot } from '@/lib/discord/notifier'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const terminations = await prisma.termination.findMany({
    include: {
      officer: { select: { id: true, firstName: true, lastName: true, badgeNumber: true, status: true, rankId: true, rank: true } },
      terminatedBy: { select: { displayName: true } },
    },
    orderBy: { terminatedAt: 'desc' },
  })

  return success(terminations)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'])
    const body = await req.json()

    const { officerId, reason } = body
    if (!officerId || !reason) return error('Officer und Grund sind erforderlich')

    const officer = await prisma.officer.findUnique({ where: { id: officerId }, include: { rank: true } })
    if (!officer) return error('Officer nicht gefunden')

    const termination = await prisma.termination.create({
      data: {
        officerId,
        reason,
        terminatedByUserId: user.id,
        previousRank: officer.rank.name,
        previousBadgeNumber: officer.badgeNumber,
      },
    })

    await prisma.officer.update({
      where: { id: officerId },
      data: { status: 'TERMINATED' },
    })

    await createAuditLog({
      action: 'OFFICER_TERMINATED',
      userId: user.id,
      officerId,
      details: `${officer.firstName} ${officer.lastName} gekündigt. Grund: ${reason}`,
    })

    void notifyDiscordBot({
      type: 'OFFICER_TERMINATED',
      officerId,
      actorDisplayName: user.displayName,
      reason,
    })

    return success(termination, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
