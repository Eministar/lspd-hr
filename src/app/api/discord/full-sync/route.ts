import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { syncAllOfficerDiscordRoles } from '@/lib/discord-integration'

export async function POST() {
  try {
    await requireAuth(['ADMIN'], ['settings:manage'])

    const result = await syncAllOfficerDiscordRoles()

    return success({
      message: `Discord-Sync abgeschlossen: ${result.synced} synchronisiert, ${result.skipped} übersprungen (keine Discord-ID), ${result.failed} fehlgeschlagen`,
      ...result,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
