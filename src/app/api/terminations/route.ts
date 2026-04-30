import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { queueDiscordHrEvent, queueOfficerRoleSync } from '@/lib/discord-integration'

export async function GET() {
  try {
    await requirePermission('terminations:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }

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
    const user = await requireAuth(['ADMIN', 'HR'], ['terminations:manage'])
    const body = await req.json()

    const { officerId, reason } = body
    if (!officerId || !reason) return error('Officer und Grund sind erforderlich')

    const officer = await prisma.officer.findUnique({ where: { id: officerId }, include: { rank: true } })
    if (!officer) return error('Officer nicht gefunden')
    if (officer.status === 'TERMINATED') return error('Officer ist bereits gekündigt')

    const termination = await prisma.termination.create({
      data: {
        officerId,
        reason,
        terminatedByUserId: user.id,
        previousRank: officer.rank.name,
        previousBadgeNumber: officer.badgeNumber,
        previousFirstName: officer.firstName,
        previousLastName: officer.lastName,
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

    queueOfficerRoleSync(officerId, 'remove-all')
    queueDiscordHrEvent({
      type: 'termination',
      title: 'Kündigung',
      description: 'Ein Officer wurde aus dem Dienst entfernt. Konfigurierte Discord-Rollen werden entzogen.',
      officer,
      actor: user,
      fields: [
        { name: 'Grund', value: String(reason) },
      ],
    })

    return success(termination, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
