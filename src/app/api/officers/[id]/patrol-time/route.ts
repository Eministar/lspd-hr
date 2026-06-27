import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { officerPatrolTime } from '@/lib/patrol-time'

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('officers:view')
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const from = parseDate(searchParams.get('from'))
    const to = parseDate(searchParams.get('to'))
    const result = await officerPatrolTime(id, from, to)
    return success(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
