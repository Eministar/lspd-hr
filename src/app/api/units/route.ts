import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission, type CurrentUser } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { automaticPermissionsForRoleNames, hasPermission, sanitizePermissions } from '@/lib/permissions'
import { getManagedUnitKeysForUser, hasOfficerWriteAccess } from '@/lib/unit-leadership'
import {
  composeUnitPermissions,
  sanitizeUnitIcon,
  sanitizeUnitModules,
} from '@/lib/unit-modules'
import { ensureDefaultNavigationUnits } from '@/lib/unit-navigation'

function createUnitKey(name: string) {
  return name
    .trim()
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export async function GET(req: NextRequest) {
  let user: CurrentUser
  try {
    user = await requirePermission('units:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }

  await ensureDefaultNavigationUnits()
  const activeOnly = req.nextUrl.searchParams.get('active') === 'true'
  const unitLeadershipOnly = activeOnly &&
    hasPermission(user, 'unit-leadership:manage') &&
    !hasOfficerWriteAccess(user) &&
    !hasPermission(user, 'units:manage')
  const managedUnitKeys = unitLeadershipOnly ? await getManagedUnitKeysForUser(user) : []

  const units = await prisma.unit.findMany({
    where: activeOnly
      ? {
          active: true,
          ...(unitLeadershipOnly ? { key: { in: managedUnitKeys } } : {}),
        }
      : undefined,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return success(units.map((unit) => ({
    ...unit,
    icon: sanitizeUnitIcon(unit.icon),
    modules: sanitizeUnitModules(unit.modules),
    permissions: Array.from(new Set([
      ...sanitizePermissions(unit.permissions),
      ...automaticPermissionsForRoleNames([unit.key, unit.name]),
    ])),
  })))
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'], ['units:manage'])
    const body = await req.json()

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return error('Name ist erforderlich')

    const key = createUnitKey(name)
    if (!key) return error('Name ergibt keinen gültigen Unit-Key')
    const modules = sanitizeUnitModules(body.modules)

    const unit = await prisma.unit.create({
      data: {
        key,
        name,
        description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
        color: typeof body.color === 'string' && body.color ? body.color : '#d4af37',
        icon: sanitizeUnitIcon(body.icon),
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
        active: typeof body.active === 'boolean' ? body.active : true,
        showInNavigation: typeof body.showInNavigation === 'boolean' ? body.showInNavigation : false,
        modules,
        permissions: Array.from(new Set([
          ...composeUnitPermissions(body.permissions, modules),
          ...automaticPermissionsForRoleNames([key, name]),
        ])),
      },
    })

    return success({ ...unit, icon: sanitizeUnitIcon(unit.icon), modules: sanitizeUnitModules(unit.modules) }, 201)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Unit existiert bereits')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
