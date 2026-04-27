import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthorizedBotRequest } from '@/lib/discord/bot-auth'
import { success, unauthorized } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  if (!(await isAuthorizedBotRequest(req))) return unauthorized()
  const ranks = await prisma.rank.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, sortOrder: true, color: true, discordRoleId: true },
  })
  return success(ranks)
}
