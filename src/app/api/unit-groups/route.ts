import { NextRequest } from 'next/server'

import { error, success, unauthorized } from '@/lib/api-response'
import { requireAuth, requirePermission } from '@/lib/auth'
import { queueAllOfficerRoleSync } from '@/lib/discord-integration'
import { officerUnitKeys } from '@/lib/officer-units'
import { automaticPermissionsForRoleNames, sanitizePermissions } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import {
  composeUnitPermissions,
  sanitizeUnitIcon,
  sanitizeUnitModules,
} from '@/lib/unit-modules'
import { ensureDefaultNavigationUnits } from '@/lib/unit-navigation'

function createGroupKey(name: string) {
  return name
    .trim()
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function discordRoleId(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'string' && /^\d{17,22}$/.test(value.trim()) ? value.trim() : undefined
}

export async function GET() {
  try {
    await requirePermission('units:view')
    await ensureDefaultNavigationUnits()

    const [groups, officers] = await Promise.all([
      prisma.unitGroup.findMany({
        include: {
          units: {
            include: { _count: { select: { userAssignments: true } } },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.officer.findMany({
        where: { status: { not: 'TERMINATED' } },
        select: { id: true, unit: true, units: true },
      }),
    ])

    const officersByUnit = new Map<string, Set<string>>()
    for (const officer of officers) {
      for (const key of officerUnitKeys(officer)) {
        const ids = officersByUnit.get(key) ?? new Set<string>()
        ids.add(officer.id)
        officersByUnit.set(key, ids)
      }
    }

    return success(groups.map((group) => {
      const groupOfficerIds = new Set<string>()
      for (const unit of group.units) {
        for (const officerId of officersByUnit.get(unit.key) ?? []) groupOfficerIds.add(officerId)
      }

      return {
        ...group,
        icon: sanitizeUnitIcon(group.icon),
        modules: sanitizeUnitModules(group.modules),
        permissions: Array.from(new Set([
          ...sanitizePermissions(group.permissions),
          ...automaticPermissionsForRoleNames([group.key, group.name]),
        ])),
        assignmentCounts: {
          officers: groupOfficerIds.size,
          directUsers: group.units.reduce((sum, unit) => sum + unit._count.userAssignments, 0),
        },
        units: group.units.map((unit) => {
          const { _count, ...unitData } = unit
          return {
            ...unitData,
            icon: sanitizeUnitIcon(unit.icon),
            modules: sanitizeUnitModules(unit.modules),
            assignmentCounts: {
              officers: officersByUnit.get(unit.key)?.size ?? 0,
              directUsers: _count.userAssignments,
            },
          }
        }),
      }
    }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'], ['units:manage'])
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return error('Name ist erforderlich')
    const key = createGroupKey(name)
    if (!key) return error('Name ergibt keinen gültigen Gruppen-Key')

    const memberDiscordRoleId = discordRoleId(body.memberDiscordRoleId)
    const leadershipDiscordRoleId = discordRoleId(body.leadershipDiscordRoleId)
    if (memberDiscordRoleId === undefined || leadershipDiscordRoleId === undefined) {
      return error('Discord-Rollen-ID ist ungültig')
    }

    const modules = sanitizeUnitModules(body.modules)
    const group = await prisma.unitGroup.create({
      data: {
        key,
        name,
        description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
        color: typeof body.color === 'string' && body.color ? body.color : '#d4af37',
        icon: sanitizeUnitIcon(body.icon),
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
        active: typeof body.active === 'boolean' ? body.active : true,
        showInNavigation: typeof body.showInNavigation === 'boolean' && Object.keys(modules).length > 0
          ? body.showInNavigation
          : false,
        modules,
        permissions: Array.from(new Set([
          ...composeUnitPermissions(body.permissions, modules),
          ...automaticPermissionsForRoleNames([key, name]),
        ])),
        memberDiscordRoleId,
        leadershipDiscordRoleId,
      },
    })

    if (memberDiscordRoleId || leadershipDiscordRoleId) queueAllOfficerRoleSync()
    return success({ ...group, icon: sanitizeUnitIcon(group.icon), modules: sanitizeUnitModules(group.modules) }, 201)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Unitgruppe existiert bereits')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
