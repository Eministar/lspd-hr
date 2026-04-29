import { prisma } from '@/lib/prisma'
import { success } from '@/lib/api-response'

export async function GET() {
  const [officers, units] = await Promise.all([
    prisma.officer.findMany({
      where: { status: { not: 'TERMINATED' } },
      select: {
        badgeNumber: true,
        firstName: true,
        lastName: true,
        status: true,
        unit: true,
        rank: { select: { name: true, color: true, sortOrder: true } },
      },
      orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
    }),
    prisma.unit.findMany({ select: { key: true, name: true, color: true } }),
  ])

  const unitMap = new Map(units.map((unit) => [unit.key, unit]))

  return success(officers.map((officer) => ({
    ...officer,
    unitInfo: officer.unit ? unitMap.get(officer.unit) ?? null : null,
  })))
}
