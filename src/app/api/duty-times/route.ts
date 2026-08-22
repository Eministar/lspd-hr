import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { getDutyTimesSnapshot } from '@/lib/duty-times'
import { runOfficerStatusAutomation } from '@/lib/absence-status'
import { officerAvatarUrl, resolveOfficerAvatarUrls } from '@/lib/officer-avatar'

export async function GET() {
  try {
    await requirePermission('duty-times:view')
    await runOfficerStatusAutomation()
    const snapshot = await getDutyTimesSnapshot()
    const avatarUrls = await resolveOfficerAvatarUrls(snapshot.rows)
    const decorate = <T extends { discordId?: string | null }>(officer: T) => ({
      ...officer,
      avatarUrl: officerAvatarUrl(officer, avatarUrls),
    })
    return success({
      ...snapshot,
      rows: snapshot.rows.map(decorate),
      activeRows: snapshot.activeRows.map(decorate),
      topRows: snapshot.topRows.map(decorate),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
