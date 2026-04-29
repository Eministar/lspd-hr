import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['ranks:manage'])
    const { id } = await params
    const body = await req.json()

    const bMin = body.badgeMin === undefined
      ? undefined
      : body.badgeMin === null || body.badgeMin === ''
        ? null
        : parseInt(String(body.badgeMin), 10)
    const bMax = body.badgeMax === undefined
      ? undefined
      : body.badgeMax === null || body.badgeMax === ''
        ? null
        : parseInt(String(body.badgeMax), 10)
    if (bMin != null && bMax != null && bMin > bMax) {
      return error('Dienstnummer-Minimum darf nicht größer als Maximum sein')
    }

    const rank = await prisma.rank.update({
      where: { id },
      data: {
        name: body.name,
        sortOrder: body.sortOrder,
        color: body.color,
        badgeMin: bMin,
        badgeMax: bMax,
      },
    })

    return success(rank)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['ranks:manage'])
    const { id } = await params

    const officerCount = await prisma.officer.count({ where: { rankId: id } })
    if (officerCount > 0) return error('Rang wird noch von Officers verwendet')

    await prisma.rank.delete({ where: { id } })
    return success({ message: 'Rang gelöscht' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}
