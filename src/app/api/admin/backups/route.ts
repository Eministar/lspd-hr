import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { berlinDay, readDailyBackupStatus } from '@/lib/daily-backup-job'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth(['ADMIN'], ['settings:manage'])
    const status = await readDailyBackupStatus()
    const current = Boolean(status?.lastSuccess && berlinDay(new Date(status.lastSuccess)) === berlinDay())
    return NextResponse.json({ success: true, data: {
      lastSuccess: status?.lastSuccess ?? null, current, failed: Boolean(status?.error),
    } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json({ success: false, error: 'Backup-Status nicht verfügbar.' },
      { status: message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500 })
  }
}
