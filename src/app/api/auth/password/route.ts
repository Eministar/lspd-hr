import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hashPassword, verifyPassword } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

export async function PATCH(req: NextRequest) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return unauthorized()

  const body = await req.json()
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!currentPassword || !newPassword) return error('Aktuelles und neues Passwort sind erforderlich')
  if (newPassword.length < 6) return error('Neues Passwort muss mindestens 6 Zeichen haben')

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { passwordHash: true },
  })
  if (!user) return unauthorized()

  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) return error('Aktuelles Passwort ist falsch', 403)

  await prisma.user.update({
    where: { id: currentUser.id },
    data: { passwordHash: await hashPassword(newPassword) },
  })

  return success({ message: 'Passwort geändert' })
}
