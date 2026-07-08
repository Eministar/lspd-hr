import { displayBadgeNumber } from '@/lib/badge-number'
import { prisma } from '@/lib/prisma'
import { getBadgePrefix } from '@/lib/settings-helpers'

type UserDisplaySource = {
  displayName: string
  discordId: string | null
}

export type LinkedOfficerDisplaySource = {
  badgeNumber: string
  firstName: string
  lastName: string
  discordId?: string | null
  status?: string | null
}

function bracketedBadgeNumber(badgeNumber: string, prefix: string) {
  const displayed = displayBadgeNumber(badgeNumber)
  if (displayed === '—') return ''

  const cleanPrefix = prefix.trim()
  if (!cleanPrefix || displayed.startsWith(cleanPrefix)) return `[${displayed}]`

  const joined = cleanPrefix.endsWith('-') ? `${cleanPrefix}${displayed}` : `${cleanPrefix}-${displayed}`
  return `[${joined}]`
}

export function formatLinkedOfficerDisplayName(officer: LinkedOfficerDisplaySource, prefix: string) {
  const name = `${officer.firstName} ${officer.lastName}`.replace(/\s+/g, ' ').trim()
  return [bracketedBadgeNumber(officer.badgeNumber, prefix), name].filter(Boolean).join(' ')
}

export async function resolveLinkedOfficerDisplayName(discordId: string | null | undefined) {
  const cleanDiscordId = discordId?.trim()
  if (!cleanDiscordId) return null

  const officer = await prisma.officer.findFirst({
    where: {
      discordId: cleanDiscordId,
      status: { not: 'TERMINATED' },
    },
    select: {
      badgeNumber: true,
      firstName: true,
      lastName: true,
    },
  })
  if (!officer) return null

  const displayName = formatLinkedOfficerDisplayName(officer, await getBadgePrefix())
  return displayName || null
}

export async function resolveUserDisplayName(user: UserDisplaySource) {
  const displayName = await resolveLinkedOfficerDisplayName(user.discordId)
  if (!displayName) return user.displayName

  const discordId = user.discordId?.trim()
  if (discordId && displayName !== user.displayName) {
    await prisma.user.updateMany({
      where: { discordId },
      data: { displayName },
    }).catch((error) => {
      console.error('[UserDisplayName] Anzeigename konnte nicht synchronisiert werden:', error)
    })
  }

  return displayName
}

export async function syncLinkedUserDisplayNameForOfficer(officer: LinkedOfficerDisplaySource) {
  const discordId = officer.discordId?.trim()
  if (!discordId || officer.status === 'TERMINATED') return null

  const displayName = formatLinkedOfficerDisplayName(officer, await getBadgePrefix())
  if (!displayName) return null

  await prisma.user.updateMany({
    where: { discordId },
    data: { displayName },
  })
  return displayName
}
