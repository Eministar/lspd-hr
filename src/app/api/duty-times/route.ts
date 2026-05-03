import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { clockInOfficer, clockOutOfficer, getDutyTimesSnapshot } from '@/lib/duty-times'
import { queueDiscordDutyEvent, queueDiscordDutyStatusUpdate } from '@/lib/discord-integration'
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

export async function POST(req: NextRequest) {
  try {
    await requirePermission('duty-times:manage')
    const body = await req.json()
    const officerId = typeof body.officerId === 'string' ? body.officerId : ''
    const action = typeof body.action === 'string' ? body.action : ''
    if (!officerId) return error('Officer ist erforderlich')

    if (action === 'clock-in') {
      const result = await clockInOfficer(officerId, 'dashboard')
      queueDiscordDutyEvent('clock-in', result.officer, result.session)
      queueDiscordDutyStatusUpdate()
      return success({ message: 'Officer eingestempelt' })
    }

    if (action === 'clock-out') {
      const result = await clockOutOfficer(officerId, 'dashboard')
      queueDiscordDutyEvent('clock-out', result.officer, result.session, result.durationMs)
      queueDiscordDutyStatusUpdate()
      return success({ message: 'Officer ausgestempelt' })
    }

    return error('Aktion ist ungültig')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
