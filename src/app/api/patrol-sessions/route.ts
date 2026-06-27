import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { ingestSession, type SessionInput } from '@/lib/patrol-sessions'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const body = (await req.json()) as SessionInput
    const result = await ingestSession(body)
    if (result.status === 'invalid') return error(result.error ?? 'Ungültige Session', 400)
    return success({ id: result.id, status: result.status }, result.status === 'created' ? 201 : 200)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
