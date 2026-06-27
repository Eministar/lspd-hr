import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { patrolLeaderboard } from '@/lib/patrol-time'

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission('patrol-board:view')
    const { searchParams } = new URL(req.url)
    const scope = searchParams.get('scope')
    const from = parseDate(searchParams.get('from'))
    const to = parseDate(searchParams.get('to'))
    const limitRaw = Number(searchParams.get('limit') ?? '20')
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 20
    const result = await patrolLeaderboard({ scope, from, to, limit })
    return success(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
