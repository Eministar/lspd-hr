import { NextRequest } from 'next/server'
import { error, success, unauthorized } from '@/lib/api-response'
import { runOfficerStatusAutomation } from '@/lib/absence-status'
import { syncDiscordAbsenceStatusMessage, syncDiscordDutyStatusMessage } from '@/lib/discord-integration'

export const runtime = 'nodejs'

function automationToken() {
  return process.env.STATUS_AUTOMATION_TOKEN?.trim() || process.env.LSPD_STATUS_AUTOMATION_TOKEN?.trim() || ''
}

export async function POST(req: NextRequest) {
  const token = automationToken()
  if (token) {
    const header = req.headers.get('authorization')?.trim() || ''
    const incoming = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : header
    if (incoming !== token) return unauthorized()
  }

  try {
    const result = await runOfficerStatusAutomation({ force: true })
    const panelResults = await Promise.allSettled([
      syncDiscordAbsenceStatusMessage(),
      syncDiscordDutyStatusMessage(),
    ])
    return success({
      ...result,
      panelsUpdated: panelResults.filter((item) => item.status === 'fulfilled').length,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    return error(msg, 500)
  }
}
