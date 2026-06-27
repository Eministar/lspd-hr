import { prisma } from './prisma'

function parseRange(from?: Date | null, to?: Date | null) {
  const where: { gte?: Date; lte?: Date } = {}
  if (from) where.gte = from
  if (to) where.lte = to
  return Object.keys(where).length ? where : undefined
}

export async function officerPatrolTime(officerId: string, from?: Date | null, to?: Date | null) {
  const joinedAt = parseRange(from, to)
  const sessions = await prisma.patrolSession.findMany({
    where: { officerId, ...(joinedAt ? { joinedAt } : {}) },
    select: { durationSeconds: true, scope: true, joinedAt: true },
  })
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  let totalSeconds = 0
  let last7DaysSeconds = 0
  let lastSessionAt: Date | null = null
  const byScope: Record<string, number> = {}
  for (const s of sessions) {
    totalSeconds += s.durationSeconds
    byScope[s.scope] = (byScope[s.scope] ?? 0) + s.durationSeconds
    if (s.joinedAt >= sevenDaysAgo) last7DaysSeconds += s.durationSeconds
    if (!lastSessionAt || s.joinedAt > lastSessionAt) lastSessionAt = s.joinedAt
  }
  return {
    officerId,
    totalSeconds,
    sessionCount: sessions.length,
    last7DaysSeconds,
    lastSessionAt: lastSessionAt ? lastSessionAt.toISOString() : null,
    byScope,
  }
}

export async function patrolLeaderboard(opts: { scope?: string | null; from?: Date | null; to?: Date | null; limit: number }) {
  const joinedAt = parseRange(opts.from, opts.to)
  const grouped = await prisma.patrolSession.groupBy({
    by: ['officerId'],
    where: {
      officerId: { not: null },
      ...(opts.scope ? { scope: opts.scope } : {}),
      ...(joinedAt ? { joinedAt } : {}),
    },
    _sum: { durationSeconds: true },
    _count: { _all: true },
    orderBy: { _sum: { durationSeconds: 'desc' } },
    take: opts.limit,
  })
  const officerIds = grouped.map((g) => g.officerId).filter((id): id is string => !!id)
  const officers = officerIds.length
    ? await prisma.officer.findMany({
        where: { id: { in: officerIds } },
        select: { id: true, firstName: true, lastName: true, badgeNumber: true },
      })
    : []
  const byId = new Map(officers.map((o) => [o.id, o]))
  return grouped.map((g) => ({
    officerId: g.officerId as string,
    officer: g.officerId ? byId.get(g.officerId) ?? null : null,
    totalSeconds: g._sum.durationSeconds ?? 0,
    sessionCount: g._count._all,
  }))
}
