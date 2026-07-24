import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { summarizeOfficerContracts } from '@/lib/contract-service'

/**
 * Alle aktiven Mitarbeiter ohne unterschriebenen Arbeitsvertrag.
 *
 * Bestandsmitarbeiter wurden vor Einführung der Vertragspflicht eingestellt und
 * haben deshalb noch keinen Vertrag. Diese Liste ist die Arbeitsgrundlage, um
 * die Unterschriften nachzuholen.
 */
export async function GET() {
  try {
    await requirePermission(['contracts:view', 'contracts:manage'])

    const officers = await prisma.officer.findMany({
      where: {
        status: { not: 'TERMINATED' },
        // Officer, die bereits einen unterschriebenen Vertrag haben, sind fertig.
        contracts: { none: { status: 'SIGNED' } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        badgeNumber: true,
        discordId: true,
        status: true,
        hireDate: true,
        rank: { select: { id: true, name: true, sortOrder: true } },
        contracts: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            signedAt: true,
            sentAt: true,
            createdAt: true,
            sendCount: true,
            lastSendError: true,
          },
        },
      },
      orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
    })

    return success(
      officers.map((officer) => ({
        ...officer,
        contract: summarizeOfficerContracts(officer.contracts),
        latestContract: officer.contracts[0] ?? null,
      })),
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
