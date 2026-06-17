import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, forbidden } from '@/lib/api-response'
import { startUpdate, getState, checkForUpdates } from '@/lib/updater'

export async function GET() {
  try {
    await requireAuth(['ADMIN'])
    const state = getState()
    const updateInfo = await checkForUpdates()
    return success({ ...state, ...updateInfo })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return forbidden()
    return error(msg, 500)
  }
}

export async function POST() {
  try {
    await requireAuth(['ADMIN'])
    const result = await startUpdate()
    if (!result.started) {
      return error(result.reason ?? 'Update konnte nicht gestartet werden', 409)
    }
    return success({ started: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return forbidden()
    return error(msg, 500)
  }
}
