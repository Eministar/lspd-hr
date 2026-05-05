import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createUserSchema } from '@/lib/validations/auth'
import { userGroupDelegate } from '@/lib/prisma-delegates'
import { sanitizePermissions } from '@/lib/permissions'

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
        permissions: true,
        group: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    return success(users.map((user) => ({
      ...user,
      permissions: sanitizePermissions(user.permissions),
    })))
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

    if (parsed.data.groupId) {
      const group = await userGroupDelegate(prisma).findUnique({ where: { id: parsed.data.groupId } })
      if (!group) return error('Benutzergruppe nicht gefunden')
    }

    const passwordHash = await hashPassword(parsed.data.password)
    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        passwordHash,
        displayName: parsed.data.displayName,
        discordId: parsed.data.discordId ?? null,
        groupId: parsed.data.groupId || null,
        permissions: sanitizePermissions(parsed.data.permissions),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        discordId: true,
        groupId: true,
        permissions: true,
        group: { select: { id: true, name: true } },
        createdAt: true,
      },
    })

    return success({ ...user, permissions: sanitizePermissions(user.permissions) }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}
