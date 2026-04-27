import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthorizedBotRequest } from '@/lib/discord/bot-auth'
import { success, unauthorized, notFound } from '@/lib/api-response'

export async function GET(req: NextRequest, { params }: { params: Promise<{ discordId: string }> }) {
  if (!(await isAuthorizedBotRequest(req))) return unauthorized()
  const { discordId } = await params

  const officer = await prisma.officer.findFirst({
    where: { discordId },
    include: {
      rank: true,
      trainings: { include: { training: true } },
    },
  })
  if (!officer) return notFound('Officer')

  return success({
    id: officer.id,
    badgeNumber: officer.badgeNumber,
    firstName: officer.firstName,
    lastName: officer.lastName,
    status: officer.status,
    discordId: officer.discordId,
    unit: officer.unit,
    flag: officer.flag,
    hireDate: officer.hireDate,
    rank: {
      id: officer.rank.id,
      name: officer.rank.name,
      color: officer.rank.color,
      sortOrder: officer.rank.sortOrder,
      discordRoleId: officer.rank.discordRoleId,
    },
    trainings: officer.trainings.map((t) => ({
      id: t.training.id,
      key: t.training.key,
      label: t.training.label,
      completed: t.completed,
      discordRoleId: t.training.discordRoleId,
    })),
  })
}
