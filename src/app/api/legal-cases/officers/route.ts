import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

/**
 * Officer-Auswahl für das Klage-Modul: alle Officers (auch gekündigte) inkl.
 * Anzahl offener Sanktionen — diejenigen ohne offene Sanktionen werden in der
 * UI nach hinten sortiert.
 */
export async function GET() {
  try {
    await requirePermission('lad:view')

    const [officers, openSanctions] = await Promise.all([
      prisma.officer.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          badgeNumber: true,
          discordId: true,
          status: true,
          rank: { select: { name: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      prisma.sanction.findMany({
        where: { status: 'OPEN', officerId: { not: null } },
        select: { officerId: true },
      }),
    ])

    const counts = new Map<string, number>()
    for (const sanction of openSanctions) {
      if (!sanction.officerId) continue
      counts.set(sanction.officerId, (counts.get(sanction.officerId) ?? 0) + 1)
    }

    const rows = officers.map((officer) => ({
      id: officer.id,
      firstName: officer.firstName,
      lastName: officer.lastName,
      badgeNumber: officer.badgeNumber,
      discordId: officer.discordId,
      status: officer.status,
      rankName: officer.rank?.name ?? null,
      openSanctionCount: counts.get(officer.id) ?? 0,
    }))

    rows.sort((a, b) => b.openSanctionCount - a.openSanctionCount
      || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'de'))

    return success(rows)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
