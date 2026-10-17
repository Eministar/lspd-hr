import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getCurrentUser, isTerminatedOfficerDiscordId, TERMINATED_OFFICER_MESSAGE, verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { success } from '@/lib/api-response'

export async function GET() {
  const user = await getCurrentUser()
  if (user) return success(user)

  // Gekündigte Officer: Sitzungs-Cookie entfernen und den Client gezielt ausloggen
  const cookieStore = await cookies()
  const token = cookieStore.get('auth-token')?.value
  const payload = token ? verifyToken(token) : null
  if (payload) {
    const sessionUser = await prisma.user.findUnique({ where: { id: payload.userId }, select: { discordId: true } })
    if (sessionUser && await isTerminatedOfficerDiscordId(sessionUser.discordId)) {
      cookieStore.delete('auth-token')
      return NextResponse.json({ success: true, data: null, signedOut: TERMINATED_OFFICER_MESSAGE })
    }
  }
  return success(null)
}
