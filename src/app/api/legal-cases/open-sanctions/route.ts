import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

/**
 * Offene Sanktionen eines Officers — Basis einer Sanktionsklage.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission('lad:view')
    const officerId = req.nextUrl.searchParams.get('officerId')?.trim()
    if (!officerId) return error('Officer ist erforderlich')

    const officer = await prisma.officer.findUnique({ where: { id: officerId }, select: { id: true } })
    if (!officer) return error('Officer nicht gefunden', 404)

    const sanctions = await prisma.sanction.findMany({
      where: { officerId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reason: true,
        penalGrade: true,
        measureType: true,
        fineAmount: true,
        sgRounds: true,
        penalty: true,
        dueAt: true,
        createdAt: true,
        issuedBy: { select: { displayName: true } },
      },
    })

    return success(sanctions)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
