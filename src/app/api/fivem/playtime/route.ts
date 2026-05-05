import { NextRequest } from 'next/server'
import { error, success, unauthorized } from '@/lib/api-response'
import { ingestFiveMPlaytime, verifyFiveMIngestToken } from '@/lib/fivem-playtime'
import { queueDiscordAbsenceStatusUpdate } from '@/lib/discord-integration'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    if (!(await verifyFiveMIngestToken(req.headers.get('authorization'), req.headers.get('x-lspd-ingest-token')))) {
      return unauthorized()
    }

    const body = await req.json()
    const result = await ingestFiveMPlaytime({
      event: body.event,
      discordId: body.discordId,
      license: body.license,
      playerName: body.playerName,
      sourceServerId: body.sourceServerId,
    })
    if ('endedAbsences' in result && (result.endedAbsences ?? 0) > 0) {
      queueDiscordAbsenceStatusUpdate()
    }

    return success({ status: result.status })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    return error(msg, 400)
  }
}
