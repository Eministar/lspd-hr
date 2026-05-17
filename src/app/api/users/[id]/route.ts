import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { userGroupDelegate } from '@/lib/prisma-delegates'
import { sanitizePermissions } from '@/lib/permissions'
import { discordIdSchema } from '@/lib/validations/officer'

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['users:manage'])
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (body.displayName) data.displayName = body.displayName
    if ('discordId' in body) {
      const parsedDiscordId = discordIdSchema.safeParse(body.discordId)
      if (!parsedDiscordId.success) return error(parsedDiscordId.error.issues.map((issue) => issue.message).join(', '))
      if (parsedDiscordId.data) {
        const existingDiscord = await prisma.user.findFirst({
          where: { discordId: parsedDiscordId.data, NOT: { id } },
        })
        if (existingDiscord) return error('Discord-ID bereits einem Benutzer zugeordnet')
      }
      data.discordId = parsedDiscordId.data ?? null
    }
    if ('permissions' in body) data.permissions = sanitizePermissions(body.permissions)
    if ('groupIds' in body || 'groupId' in body) {
      const groupIds = sanitizeGroupIds(body.groupIds ?? (body.groupId ? [body.groupId] : []))
      if (groupIds.length > 0) {
        const groups = await userGroupDelegate(prisma).findMany({ where: { id: { in: groupIds } } })
        if (groups.length !== groupIds.length) return error('Benutzergruppe nicht gefunden')
      }
      data.groupMemberships = {
        deleteMany: {},
        create: groupIds.map((groupId) => ({ groupId })),
      }
      data.groupId = groupIds[0] ?? null
    }
    if (body.password) data.passwordHash = await hashPassword(body.password)

    const user = await prisma.user.update({
      where: { id },
      data,
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

    return success(serializeUser(user))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth(['ADMIN'], ['users:manage'])
    const { id } = await params

    if (currentUser.id === id) return error('Du kannst dich nicht selbst löschen')

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return notFound('Benutzer')

    await prisma.user.delete({ where: { id } })
    return success({ message: 'Benutzer gelöscht' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}
