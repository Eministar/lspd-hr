import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  try {
    await requirePermission('rank-changes:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }

  const type = req.nextUrl.searchParams.get('type') || undefined

  const lists = await prisma.rankChangeList.findMany({
    where: type ? { type } : undefined,
    include: {
      createdBy: { select: { displayName: true } },
      entries: {
        include: {
          officer: { select: { firstName: true, lastName: true, badgeNumber: true } },
          currentRank: { select: { name: true, color: true } },
          proposedRank: { select: { name: true, color: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return success(lists)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['rank-changes:manage'])
    const body = await req.json()

    const { name, description, type } = body
    if (!name?.trim()) return error('Name ist erforderlich')
    if (type && !['PROMOTION', 'DEMOTION'].includes(type)) return error('Ungültiger Typ')

    const list = await prisma.rankChangeList.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        type: type || 'PROMOTION',
        createdById: user.id,
      },
      include: {
        createdBy: { select: { displayName: true } },
        entries: true,
      },
    })

    return success(list, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
