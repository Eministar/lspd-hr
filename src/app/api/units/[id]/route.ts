import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['units:manage'])
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return error('Name darf nicht leer sein')
      data.name = name
    }
    if (typeof body.color === 'string' && body.color) data.color = body.color
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder
    if (typeof body.active === 'boolean') data.active = body.active

    const unit = await prisma.unit.update({ where: { id }, data })
    return success(unit)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['units:manage'])
    const { id } = await params

    const unit = await prisma.unit.findUnique({ where: { id } })
    if (!unit) return notFound('Unit')

    const officerCount = await prisma.officer.count({ where: { unit: unit.key } })
    if (officerCount > 0) return error('Unit wird noch von Officers verwendet')

    await prisma.unit.delete({ where: { id } })
    return success({ message: 'Unit gelöscht' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
