import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createUserSchema } from '@/lib/validations/auth'

export async function GET() {
  try {
    await requireAuth(['ADMIN'])
    const users = await prisma.user.findMany({
      select: { id: true, username: true, displayName: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    return success(users)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'])
    const body = await req.json()
    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) return error(parsed.error.issues.map(e => e.message).join(', '))

    const existing = await prisma.user.findUnique({ where: { username: parsed.data.username } })
    if (existing) return error('Benutzername bereits vergeben')

    const passwordHash = await hashPassword(parsed.data.password)
    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        passwordHash,
        displayName: parsed.data.displayName,
        role: parsed.data.role,
      },
      select: { id: true, username: true, displayName: true, role: true, createdAt: true },
    })

    return success(user, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}
