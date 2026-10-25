import type { Officer, Rank } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import type { CurrentUser } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'
import { queueDiscordHrEvent, queueOfficerRoleSync } from '@/lib/discord-integration'
import { releaseTerminatedBadgeNumber } from '@/lib/badge-blacklist'

type DiscordField = { name: string; value: string; inline?: boolean }

/**
 * Kündigt einen Officer: Termination-Eintrag, Status TERMINATED, DN freigeben,
 * Audit-Log, Discord-Rollen entfernen und HR-Event. Gemeinsam genutzt von der
 * direkten Kündigung und von Kündigungen aus Up-/D-Rank-Listen.
 */
export async function terminateOfficer({
  officer,
  reason,
  user,
  auditDetails,
  description,
  extraFields = [],
}: {
  officer: Officer & { rank: Rank }
  reason: string
  user: Pick<CurrentUser, 'id' | 'displayName' | 'discordId'>
  auditDetails?: string
  description?: string
  extraFields?: DiscordField[]
}) {
  const termination = await prisma.termination.create({
    data: {
      officerId: officer.id,
      reason,
      terminatedByUserId: user.id,
      previousRank: officer.rank.name,
      previousBadgeNumber: officer.badgeNumber,
      previousFirstName: officer.firstName,
      previousLastName: officer.lastName,
    },
  })

  await prisma.$transaction(async (tx) => {
    await tx.officer.update({
      where: { id: officer.id },
      data: { status: 'TERMINATED' },
    })
    await releaseTerminatedBadgeNumber(officer, tx)
  })

  await createAuditLog({
    action: 'OFFICER_TERMINATED',
    userId: user.id,
    officerId: officer.id,
    details: auditDetails ?? `${officer.firstName} ${officer.lastName} gekündigt. Grund: ${reason}`,
  })

  queueOfficerRoleSync(officer.id, 'remove-all')
  queueDiscordHrEvent({
    type: 'termination',
    title: `Kündigung: ${officer.firstName} ${officer.lastName}`,
    description,
    officer,
    actor: user,
    fields: [
      { name: 'Grund', value: reason, inline: false },
      ...extraFields,
    ],
  })

  return termination
}
