import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { userGroupDelegate } from '@/lib/prisma-delegates'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['users:manage'])
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (body.displayName) data.displayName = body.displayName
    if (body.role) data.role = body.role
    if ('groupId' in body) {
      if (body.groupId) {
        const group = await userGroupDelegate(prisma).findUnique({ where: { id: String(body.groupId) } })
        if (!group) return error('Benutzergruppe nicht gefunden')
        data.groupId = group.id
      } else {
        data.groupId = null
      }
    }
    if (body.password) data.passwordHash = await hashPassword(body.password)

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        groupId: true,
        group: { select: { id: true, name: true } },
        createdAt: true,
      },
    })

    return success(user)
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
