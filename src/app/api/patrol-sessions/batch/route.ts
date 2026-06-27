import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { ingestSession, type SessionInput } from '@/lib/patrol-sessions'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const body = await req.json()
    const sessions: SessionInput[] = Array.isArray(body?.sessions) ? body.sessions : []
    if (sessions.length === 0) return error('sessions[] ist erforderlich', 400)
    if (sessions.length > 500) return error('Maximal 500 Sessions pro Batch', 400)

    let created = 0
    let updated = 0
    let skipped = 0
    for (const input of sessions) {
      const result = await ingestSession(input)
      if (result.status === 'created') created++
      else if (result.status === 'updated') updated++
      else skipped++
    }
    return success({ created, updated, skipped, total: sessions.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
