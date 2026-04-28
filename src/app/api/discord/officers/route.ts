import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthorizedBotRequest } from '@/lib/discord/bot-auth'
import { success, unauthorized } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  if (!(await isAuthorizedBotRequest(req))) return unauthorized()

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '25', 10) || 25, 50)

  const where = q
    ? {
        OR: [
          { badgeNumber: { contains: q } },
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { discordId: { contains: q } },
        ],
      }
    : undefined

  const officers = await prisma.officer.findMany({
    where,
    include: { rank: { select: { id: true, name: true, color: true, sortOrder: true } } },
    orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
    take: limit,
  })

  return success(
    officers.map((o) => ({
      id: o.id,
      badgeNumber: o.badgeNumber,
      firstName: o.firstName,
      lastName: o.lastName,
      status: o.status,
      discordId: o.discordId,
      unit: o.unit,
      flag: o.flag,
      hireDate: o.hireDate,
      rank: o.rank,
    }))
  )
}
