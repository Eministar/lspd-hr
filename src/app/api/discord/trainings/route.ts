import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthorizedBotRequest } from '@/lib/discord/bot-auth'
import { success, unauthorized } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  if (!(await isAuthorizedBotRequest(req))) return unauthorized()
  const trainings = await prisma.training.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, key: true, label: true, sortOrder: true, discordRoleId: true },
  })
  return success(trainings)
}
