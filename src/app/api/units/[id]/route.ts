import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { automaticPermissionsForRoleNames } from '@/lib/permissions'
import {
  composeUnitPermissions,
  sanitizeUnitIcon,
  sanitizeUnitModules,
} from '@/lib/unit-modules'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['units:manage'])
    const { id } = await params
    const body = await req.json()
    const existing = await prisma.unit.findUnique({ where: { id } })
    if (!existing) return notFound('Unit')

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return error('Name darf nicht leer sein')
      data.name = name
    }
    if ('description' in body) {
      data.description = typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null
    }
    if (typeof body.color === 'string' && body.color) data.color = body.color
    if (typeof body.icon === 'string') data.icon = sanitizeUnitIcon(body.icon)
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder
    if (typeof body.active === 'boolean') data.active = body.active
    if (typeof body.showInNavigation === 'boolean') data.showInNavigation = body.showInNavigation

    const modules = 'modules' in body ? sanitizeUnitModules(body.modules) : sanitizeUnitModules(existing.modules)
    if ('modules' in body) data.modules = modules
    if (Array.isArray(body.permissions) || 'modules' in body) {
      data.permissions = Array.from(new Set([
        ...composeUnitPermissions(
          Array.isArray(body.permissions) ? body.permissions : existing.permissions,
          modules,
        ),
        ...automaticPermissionsForRoleNames([
          existing.key,
          typeof data.name === 'string' ? data.name : existing.name,
        ]),
      ]))
    }

    const unit = await prisma.unit.update({ where: { id }, data })
    return success({ ...unit, icon: sanitizeUnitIcon(unit.icon), modules: sanitizeUnitModules(unit.modules) })
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

    const officerCount = await prisma.officer.count({
      where: {
        OR: [
          { unit: unit.key },
          { units: { array_contains: unit.key } },
        ],
      },
    })
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
