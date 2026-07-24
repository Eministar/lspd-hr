import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

/**
 * Schlanke Bewerbungsliste für die Officer-Anlage: nur die Felder, die zum
 * Auswählen und Vorbefüllen nötig sind. Bewusst über `officers:write`
 * abgesichert — wer Officer anlegen darf, darf die zugehörige Bewerbung
 * verknüpfen, auch ohne vollen HR-Zugriff.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(['officers:write', 'hr:view', 'contracts:manage'])

    // Standard: nur noch nicht verknüpfte Bewerbungen. `all=true` zeigt auch
    // bereits verknüpfte, damit eine falsche Zuordnung korrigiert werden kann.
    const includeLinked = req.nextUrl.searchParams.get('all') === 'true'

    const applications = await prisma.jobApplication.findMany({
      where: includeLinked ? {} : { officerId: null },
      select: {
        id: true,
        applicantDisplayName: true,
        discordId: true,
        discordUsername: true,
        discordGlobalName: true,
        status: true,
        submittedAt: true,
        officerId: true,
        officer: { select: { id: true, firstName: true, lastName: true, badgeNumber: true } },
      },
      orderBy: [{ submittedAt: 'desc' }],
      take: 300,
    })

    return success(applications)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
