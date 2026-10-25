import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { terminateOfficer } from '@/lib/officer-termination'

export async function GET() {
  try {
    await requirePermission(['terminations:view', 'internal-affairs:view'])
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
    const user = await requireAuth(['ADMIN', 'HR'], ['terminations:manage', 'internal-affairs:manage'])
    const body = await req.json()

    const { officerId, reason } = body
    if (!officerId || !reason) return error('Officer und Grund sind erforderlich')

    const officer = await prisma.officer.findUnique({ where: { id: officerId }, include: { rank: true } })
    if (!officer) return error('Officer nicht gefunden')
    if (officer.status === 'TERMINATED') return error('Officer ist bereits gekündigt')

    const termination = await terminateOfficer({ officer, reason: String(reason), user })

    return success(termination, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
