import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { sanitizePermissions } from '@/lib/permissions'
import { getDiscordGuildMember } from '@/lib/discord-integration'
import { serializeDiscordBackedUser, upsertDiscordUser } from '@/lib/discord-auth'

function serializeUser<T extends {
  permissions: unknown
  groupId: string | null
  group: { id: string; name: string } | null
  groupMemberships: { group: { id: string; name: string } }[]
  discordId: string | null
  discordAvatar?: string | null
  discordDiscriminator?: string | null
}>(user: T) {
  return serializeDiscordBackedUser(user)
}

async function ensureUserId(id: string) {
  if (!id.startsWith('discord:')) return id
  const discordId = id.slice('discord:'.length)
  const member = await getDiscordGuildMember(discordId)
  if (!member?.user) throw new Error('Discord-Benutzer nicht gefunden')
  const user = await upsertDiscordUser({
    user: member.user,
    roles: member.roles ?? [],
    nick: member.nick,
    avatar: member.avatar,
  })
  return user.id
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['users:manage'])
    const { id: rawId } = await params
    const id = await ensureUserId(rawId)
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if ('permissions' in body) data.permissions = sanitizePermissions(body.permissions)

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        displayName: true,
        discordId: true,
        discordUsername: true,
        discordGlobalName: true,
        discordAvatar: true,
        discordDiscriminator: true,
        lastLoginAt: true,
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
    if (id.startsWith('discord:')) return success({ message: 'Discord-Benutzer bleibt sichtbar' })

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
