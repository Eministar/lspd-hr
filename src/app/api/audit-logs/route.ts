import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['logs:view'])
    
    const { searchParams } = new URL(req.url)
    const take = parseInt(searchParams.get('take') || '50')
    const skip = parseInt(searchParams.get('skip') || '0')

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: {
          user: { select: { displayName: true } },
          officer: { select: { firstName: true, lastName: true, badgeNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.auditLog.count(),
    ])

    return success({ logs, total, take, skip })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}
