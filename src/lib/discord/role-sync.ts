import { prisma } from '@/lib/prisma'

export interface RoleSyncPlan {
  officerId: string
  discordId: string | null
  /** Discord role IDs the officer SHOULD have (rank role + completed training roles). */
  shouldHave: string[]
  /** All Discord role IDs that are managed by this app (so the bot can remove stale ones). */
  managedRoles: string[]
  rankRoleId: string | null
  trainingRoleIds: string[]
  context: {
    badgeNumber: string
    fullName: string
    rankName: string
    status: string
  }
}

/**
 * Computes the set of Discord roles that should be applied to an officer based
 * on their current rank and completed trainings. The bot uses this as the
 * source of truth — it adds missing roles and removes stale managed roles.
 */
export async function computeRoleSyncPlan(officerId: string): Promise<RoleSyncPlan | null> {
  const officer = await prisma.officer.findUnique({
    where: { id: officerId },
    include: {
      rank: true,
      trainings: { include: { training: true } },
    },
  })
  if (!officer) return null

  const rankRoleId = officer.rank.discordRoleId?.trim() || null

  const trainingRoleIds = officer.trainings
    .filter((t) => t.completed && t.training.discordRoleId)
    .map((t) => t.training.discordRoleId!.trim())
    .filter(Boolean)

  const allRanks = await prisma.rank.findMany({ where: { discordRoleId: { not: null } } })
  const allTrainings = await prisma.training.findMany({ where: { discordRoleId: { not: null } } })
  const managedRoles = [
    ...allRanks.map((r) => r.discordRoleId!).filter(Boolean),
    ...allTrainings.map((t) => t.discordRoleId!).filter(Boolean),
  ]

  const shouldHave = officer.status === 'TERMINATED'
    ? []
    : Array.from(new Set([rankRoleId, ...trainingRoleIds].filter(Boolean) as string[]))

  return {
    officerId: officer.id,
    discordId: officer.discordId,
    shouldHave,
    managedRoles: Array.from(new Set(managedRoles)),
    rankRoleId,
    trainingRoleIds,
    context: {
      badgeNumber: officer.badgeNumber,
      fullName: `${officer.firstName} ${officer.lastName}`,
      rankName: officer.rank.name,
      status: officer.status,
    },
  }
}
