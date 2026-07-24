import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createOfficerSchema } from '@/lib/validations/officer'
import { createAuditLog } from '@/lib/audit'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { getAllowDuplicateBadgeNumbers, getBadgePrefix } from '@/lib/settings-helpers'
import { nextBadgeForRank, normalizeBadgeNumber } from '@/lib/badge-number'
import { findBadgeNumberConflict, getBlacklistedBadgeRows, releaseTerminatedBadgeNumberConflicts } from '@/lib/badge-blacklist'
import { normalizeUnitKeys } from '@/lib/officer-units'
import { eligibleTrainingsForRank, withOfficerTrainingRows } from '@/lib/officer-trainings'
import {
  canCheckDiscordGuildMembers,
  getCachedDiscordGuildMembers,
  getDiscordConfig,
  queueDiscordHrEvent,
  queueOfficerRoleSync,
  refreshDiscordGuildMembers,
} from '@/lib/discord-integration'
import { runOfficerStatusAutomation } from '@/lib/absence-status'
import { syncLinkedUserDisplayNameForOfficer } from '@/lib/user-display-name'
import { loadContractSummaries, queueContractForNewOfficer } from '@/lib/contract-service'

function validDiscordId(value: string | null | undefined) {
  const id = value?.trim()
  return id && /^\d{17,22}$/.test(id) ? id : ''
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission('officers:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }

  const { searchParams } = new URL(req.url)
  await runOfficerStatusAutomation()
  const search = searchParams.get('search')
  const status = searchParams.get('status')
  const rankId = searchParams.get('rankId')

  const where: Record<string, unknown> = {}
  if (search) {
    const canSearchDiscordId = /^\d{17,22}$/.test(search.trim())
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { badgeNumber: { contains: search } },
      ...(canSearchDiscordId ? [{ discordId: { contains: search } }] : []),
    ]
  }
  if (status) where.status = status
  else where.status = { not: 'TERMINATED' }
  if (rankId) where.rankId = rankId

  const [officers, trainings, discordConfig, canCheckDiscordMembers] = await Promise.all([
    prisma.officer.findMany({
      where,
      include: {
        rank: true,
        trainings: { include: { training: { include: { minRank: true } } } },
      },
      orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
    }),
    prisma.training.findMany({
      include: { minRank: true },
      orderBy: { sortOrder: 'asc' },
    }),
    getDiscordConfig(),
    canCheckDiscordGuildMembers(),
  ])
  const cachedDiscordMembers = canCheckDiscordMembers
    ? getCachedDiscordGuildMembers(discordConfig.guildId)
    : null
  if (canCheckDiscordMembers && !cachedDiscordMembers) {
    refreshDiscordGuildMembers(discordConfig.guildId)
  }
  const discordMembers = cachedDiscordMembers ?? []
  const discordMemberIds = new Set(discordMembers.map((member) => member.user?.id).filter(Boolean))
  const contractSummaries = await loadContractSummaries(officers.map((officer) => officer.id))

  return success(officers.map((officer) => {
    const discordId = validDiscordId(officer.discordId)
    return {
      ...withOfficerTrainingRows(officer, trainings),
      discordMember: {
        checked: canCheckDiscordMembers && cachedDiscordMembers !== null && !!discordId,
        inGuild: !!discordId && discordMemberIds.has(discordId),
      },
      contract: contractSummaries.get(officer.id) ?? null,
    }
  }))
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['officers:write'])
    const body = await req.json()
    const parsed = createOfficerSchema.safeParse(body)
    if (!parsed.success) {
      return error(parsed.error.issues.map(e => e.message).join(', '))
    }

    const rank = await prisma.rank.findUnique({ where: { id: parsed.data.rankId } })
    if (!rank) return error('Rang nicht gefunden')

    let badgeNumber = parsed.data.badgeNumber?.trim() ?? ''
    const prefix = await getBadgePrefix()
    if (badgeNumber) badgeNumber = normalizeBadgeNumber(badgeNumber, prefix)
    if (!badgeNumber) {
      // Exclude terminated officers so their badge numbers are treated as free
      const allRows = await prisma.officer.findMany({ where: { status: { not: 'TERMINATED' } }, select: { badgeNumber: true } })
      const blacklistedBadges = await getBlacklistedBadgeRows()
      const assigned = nextBadgeForRank(rank, allRows, prefix, null, blacklistedBadges)
      if (!assigned) return error('Keine freie Dienstnummer im Bereich des ausgewählten Rangs')
      badgeNumber = assigned.str
    }

    const allowDuplicateBadgeNumbers = await getAllowDuplicateBadgeNumbers()
    const badgeConflict = await findBadgeNumberConflict(badgeNumber, prefix, null, { allowOfficerDuplicate: allowDuplicateBadgeNumbers })
    if (badgeConflict) return error(badgeConflict)
    await releaseTerminatedBadgeNumberConflicts(badgeNumber, prefix)

    const did = parsed.data.discordId ?? null
    if (did) {
      const existingDiscord = await prisma.officer.findFirst({ where: { discordId: did } })
      if (existingDiscord) return error('Discord-ID bereits vergeben')
    }

    const applicationId = parsed.data.applicationId ?? null
    if (applicationId) {
      const application = await prisma.jobApplication.findUnique({
        where: { id: applicationId },
        select: { id: true, officerId: true },
      })
      if (!application) return error('Bewerbung nicht gefunden')
      if (application.officerId) return error('Diese Bewerbung ist bereits mit einem Officer verknüpft')
    }

    const unitKeys = normalizeUnitKeys(parsed.data.units ?? (parsed.data.unit ? [parsed.data.unit] : []))
    if (unitKeys.length > 0) {
      const activeUnits = await prisma.unit.findMany({ where: { key: { in: unitKeys }, active: true } })
      const activeKeys = new Set(activeUnits.map((unit) => unit.key))
      const missing = unitKeys.find((key) => !activeKeys.has(key))
      if (missing) return error('Unit nicht gefunden')
    }

    const officer = await prisma.officer.create({
      data: {
        badgeNumber,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        rankId: parsed.data.rankId,
        discordId: did,
        notes: parsed.data.notes || null,
        hireDate: parsed.data.hireDate ? new Date(parsed.data.hireDate) : new Date(),
        status: parsed.data.status || 'ACTIVE',
        unit: unitKeys[0] ?? null,
        units: unitKeys,
        flag: parsed.data.flag ?? null,
      },
      include: { rank: true },
    })

    const trainings = await prisma.training.findMany({ include: { minRank: true } })
    const eligibleTrainings = eligibleTrainingsForRank(trainings, rank)
    if (eligibleTrainings.length > 0) {
      await prisma.officerTraining.createMany({
        data: eligibleTrainings.map(t => ({
          officerId: officer.id,
          trainingId: t.id,
          completed: false,
        })),
      })
    }

    await createAuditLog({
      action: 'OFFICER_CREATED',
      userId: user.id,
      officerId: officer.id,
      newValue: `${officer.firstName} ${officer.lastName} (${officer.badgeNumber})`,
    })

    if (applicationId) {
      await prisma.jobApplication.update({
        where: { id: applicationId },
        data: { officerId: officer.id },
      })
    }

    await syncLinkedUserDisplayNameForOfficer(officer)
    queueOfficerRoleSync(officer.id)
    queueDiscordHrEvent({
      type: 'hire',
      title: 'Neuer Beitritt',
      officer,
      actor: user,
    })

    // Arbeitsvertrag ist Pflicht: JEDER neue Mitarbeiter bekommt automatisch
    // seinen persönlichen Vertragslink per Discord-DM (mit Channel-Fallback).
    // Die Einstellung gilt erst mit unterschriebenem Vertrag als abgeschlossen —
    // deshalb gibt es hier bewusst kein Opt-out. Schlägt die Zustellung fehl,
    // wird das am Vertrag protokolliert und HR kann erneut senden.
    const contract = await queueContractForNewOfficer({
      officer,
      templateId: parsed.data.contractTemplateId ?? null,
      applicationId,
      createdById: user.id,
      req,
    })

    return success({
      ...officer,
      contractId: contract?.id ?? null,
      contractCreated: Boolean(contract),
    }, 201)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Discord-ID bereits vergeben')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
