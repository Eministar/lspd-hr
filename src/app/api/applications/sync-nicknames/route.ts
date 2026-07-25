import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { refreshApplicantIdentity, type NicknameSyncStatus } from '@/lib/application-identity'

/** Mehr als das pro Lauf würde nur ins Discord-Rate-Limit rennen. */
const MAX_PER_RUN = 100

/**
 * Zieht die Umbenennung für alle Bewerber nach. Läuft bewusst sequenziell:
 * Discord limitiert Nickname-Änderungen, parallele Aufrufe würden reihenweise
 * abgewiesen.
 */
export async function POST(_req: NextRequest) {
  try {
    const user = await requirePermission('hr:manage')

    const applications = await prisma.jobApplication.findMany({
      where: { discordId: { not: '' } },
      orderBy: { submittedAt: 'asc' },
      select: { id: true },
      take: MAX_PER_RUN,
    })

    const counts: Record<NicknameSyncStatus, number> = {
      synced: 0,
      skipped: 0,
      'not-member': 0,
      'missing-permissions': 0,
      failed: 0,
    }

    for (const application of applications) {
      const result = await refreshApplicantIdentity(application.id)
      if (result) counts[result.nickname] += 1
    }

    await createAuditLog({
      action: 'APPLICATION_NICKNAMES_SYNCED',
      userId: user.id,
      newValue: String(counts.synced),
      details: `${applications.length} Bewerbungen geprüft`,
    })

    return success({ processed: applications.length, counts })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
