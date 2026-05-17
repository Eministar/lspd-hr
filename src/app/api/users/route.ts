import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createUserSchema } from '@/lib/validations/auth'
import { userGroupDelegate } from '@/lib/prisma-delegates'
import { sanitizePermissions } from '@/lib/permissions'

function sanitizeGroupIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(
    value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()),
  ))
}

function serializeUser<T extends {
  permissions: unknown
  groupId: string | null
  group: { id: string; name: string } | null
  groupMemberships: { group: { id: string; name: string } }[]
}>(user: T) {
  const groupsById = new Map(user.groupMemberships.map((membership) => [membership.group.id, membership.group]))
  if (user.group && !groupsById.has(user.group.id)) groupsById.set(user.group.id, user.group)
  const groups = Array.from(groupsById.values())
  const { groupMemberships, ...rest } = user
  return {
    ...rest,
    groupIds: groups.map((group) => group.id),
    groups,
    permissions: sanitizePermissions(user.permissions),
  }
}

export async function GET() {
  try {
    await requireAuth(['ADMIN'], ['users:manage'])
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        discordId: true,
        groupId: true,
        group: { select: { id: true, name: true } },
        permissions: true,
        groupMemberships: {
          select: { group: { select: { id: true, name: true } } },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    return success(users.map(serializeUser))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'], ['users:manage'])
    const body = await req.json()
    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) return error(parsed.error.issues.map(e => e.message).join(', '))

    const existing = await prisma.user.findUnique({ where: { username: parsed.data.username } })
    if (existing) return error('Benutzername bereits vergeben')

    if (parsed.data.discordId) {
      const existingDiscord = await prisma.user.findFirst({ where: { discordId: parsed.data.discordId } })
      if (existingDiscord) return error('Discord-ID bereits einem Benutzer zugeordnet')
    }

    const groupIds = sanitizeGroupIds(parsed.data.groupIds ?? (parsed.data.groupId ? [parsed.data.groupId] : []))
    if (groupIds.length > 0) {
      const groups = await userGroupDelegate(prisma).findMany({ where: { id: { in: groupIds } } })
      if (groups.length !== groupIds.length) return error('Benutzergruppe nicht gefunden')
    }

    const passwordHash = await hashPassword(parsed.data.password)
    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        passwordHash,
        displayName: parsed.data.displayName,
        discordId: parsed.data.discordId ?? null,
        groupId: groupIds[0] ?? null,
        permissions: sanitizePermissions(parsed.data.permissions),
        groupMemberships: {
          create: groupIds.map((groupId) => ({ groupId })),
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        discordId: true,
        groupId: true,
        group: { select: { id: true, name: true } },
        permissions: true,
        groupMemberships: {
          select: { group: { select: { id: true, name: true } } },
        },
        createdAt: true,
      },
    })

    return success(serializeUser(user), 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}
