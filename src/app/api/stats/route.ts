import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { success, unauthorized } from '@/lib/api-response'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [
    totalOfficers,
    activeOfficers,
    awayOfficers,
    inactiveOfficers,
    terminatedOfficers,
    totalPromotions,
    recentPromotions,
    recentTerminations,
    rankDistribution,
  ] = await Promise.all([
    prisma.officer.count(),
    prisma.officer.count({ where: { status: 'ACTIVE' } }),
    prisma.officer.count({ where: { status: 'AWAY' } }),
    prisma.officer.count({ where: { status: 'INACTIVE' } }),
    prisma.officer.count({ where: { status: 'TERMINATED' } }),
    prisma.promotionLog.count(),
    prisma.promotionLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.termination.count({
      where: { terminatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.officer.groupBy({
      by: ['rankId'],
      _count: true,
      where: { status: { not: 'TERMINATED' } },
    }),
  ])

  const ranks = await prisma.rank.findMany({ orderBy: { sortOrder: 'asc' } })
  const distribution = ranks.map((rank) => ({
    rank: rank.name,
    color: rank.color,
    count: rankDistribution.find((r) => r.rankId === rank.id)?._count || 0,
  }))

  return success({
    totalOfficers,
    activeOfficers,
    awayOfficers,
    inactiveOfficers,
    terminatedOfficers,
    totalPromotions,
    recentPromotions,
    recentTerminations,
    rankDistribution: distribution,
  })
}
