import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { getDutyTimesSnapshot } from '@/lib/duty-times'
import { runOfficerStatusAutomation } from '@/lib/absence-status'

export async function GET() {
  try {
    await requirePermission('duty-times:view')
    await runOfficerStatusAutomation()
    const snapshot = await getDutyTimesSnapshot()
    return success(snapshot)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
