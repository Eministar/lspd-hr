import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyPassword, signToken } from '@/lib/auth'
import { success, error } from '@/lib/api-response'
import { loginSchema } from '@/lib/validations/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) return error('Ungültige Anmeldedaten')

    const user = await prisma.user.findUnique({ where: { username: parsed.data.username } })
    if (!user) return error('Benutzername oder Passwort falsch', 401)

    const valid = await verifyPassword(parsed.data.password, user.passwordHash)
    if (!valid) return error('Benutzername oder Passwort falsch', 401)

    const token = signToken({ userId: user.id, username: user.username, role: user.role })
    const cookieStore = await cookies()
    cookieStore.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })

    return success({
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }
    })
  } catch (e) {
    return error('Serverfehler', 500)
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('auth-token')
  return success({ message: 'Abgemeldet' })
}
