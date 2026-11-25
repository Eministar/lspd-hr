import { requireAuth } from '@/lib/auth'
import { error, success, unauthorized } from '@/lib/api-response'
import { getDiscordConfig, syncClipChannels } from '@/lib/discord-integration'

/** Legt alle fehlenden Clips-Channels an, verschiebt, sortiert und räumt auf. */
export async function POST() {
  try {
    await requireAuth(['ADMIN'], ['settings:manage'])
    const config = await getDiscordConfig()
    if (!config.guildId) return error('Kein Discord-Server konfiguriert.')
    if (!config.clipsAnalystRoleId) return error('Keine Clips-Analysten-Rolle gespeichert – ohne sie werden keine Clips-Channels angelegt.')

    const stats = await syncClipChannels(config)
    if (!stats) return error('Discord-Bot ist nicht konfiguriert.')
    return success({
      ...stats,
      message: `Clips-Channels synchronisiert: ${stats.total} insgesamt, ${stats.created} neu angelegt, ${stats.updated} aktualisiert, ${stats.deleted} gelöscht.`,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
