import { NextRequest } from 'next/server'
import { error, success, unauthorized } from '@/lib/api-response'
import { ingestFiveMPlaytime, verifyFiveMIngestToken } from '@/lib/fivem-playtime'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    if (!(await verifyFiveMIngestToken(req.headers.get('authorization')))) {
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

    return success({ status: result.status })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    return error(msg, 400)
  }
}
