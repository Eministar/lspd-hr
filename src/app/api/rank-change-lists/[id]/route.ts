import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { id } = await params
  const list = await prisma.rankChangeList.findUnique({
    where: { id },
    include: {
      createdBy: { select: { displayName: true } },
      entries: {
        include: {
          officer: { select: { id: true, firstName: true, lastName: true, badgeNumber: true, status: true } },
          currentRank: { select: { id: true, name: true, color: true, sortOrder: true } },
          proposedRank: { select: { id: true, name: true, color: true, sortOrder: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!list) return error('Liste nicht gefunden', 404)
  return success(list)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN', 'HR'], ['rank-changes:manage'])
    const { id } = await params
    const body = await req.json()

    const { name, description, status } = body

    const list = await prisma.rankChangeList.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(status !== undefined && { status }),
      },
    })

    return success(list)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN', 'HR'], ['rank-changes:manage'])
    const { id } = await params

    await prisma.rankChangeList.delete({ where: { id } })
    return success({ deleted: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
