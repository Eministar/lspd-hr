import { getCurrentUser } from '@/lib/auth'
import { error, success, unauthorized } from '@/lib/api-response'
import { desktopDownloadPath, readLatestDesktopRelease } from '@/lib/desktop-releases'

export const dynamic = 'force-dynamic'

/** Aktuelle Version von „LSPD Kill-Clips“ für die Download-Seite – für jeden eingeloggten Nutzer. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  try {
    const release = await readLatestDesktopRelease()
    return success(release && {
      version: release.version,
      pubDate: release.pubDate,
      size: release.size,
      notes: release.notes ?? null,
      downloadUrl: desktopDownloadPath(release),
    })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'Release konnte nicht gelesen werden', 500)
  }
}
