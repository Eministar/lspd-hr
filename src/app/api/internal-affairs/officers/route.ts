import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { error, success, unauthorized } from '@/lib/api-response'
import { officerAvatarUrl, resolveOfficerAvatarUrls } from '@/lib/officer-avatar'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requirePermission('internal-affairs:view')

    const officers = await prisma.officer.findMany({
      where: { status: { not: 'TERMINATED' } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        badgeNumber: true,
        discordId: true,
        status: true,
        rank: { select: { id: true, name: true, color: true, sortOrder: true } },
        searches: {
          select: { conductedAt: true },
          orderBy: { conductedAt: 'desc' },
          take: 1,
        },
        _count: { select: { searches: true } },
      },
      orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
    })
    const avatarUrls = await resolveOfficerAvatarUrls(officers)

    return success(officers.map((officer) => ({
      id: officer.id,
      firstName: officer.firstName,
      lastName: officer.lastName,
      badgeNumber: officer.badgeNumber,
      status: officer.status,
      rank: officer.rank,
      avatarUrl: officerAvatarUrl(officer, avatarUrls),
      searchCount: officer._count.searches,
      lastSearchAt: officer.searches[0]?.conductedAt ?? null,
    })))
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'Serverfehler'
    if (message === 'Unauthorized') return unauthorized()
    if (message === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(message, 500)
  }
}
