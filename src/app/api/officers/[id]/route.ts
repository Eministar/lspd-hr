import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { updateOfficerSchema } from '@/lib/validations/officer'
import { createAuditLog } from '@/lib/audit'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { hasPermission } from '@/lib/permissions'
import { normalizeUnitKeys, officerUnitKeys } from '@/lib/officer-units'
import { getManagedUnitKeysForUser, hasOfficerWriteAccess, unitLeadershipChangeError } from '@/lib/unit-leadership'
import { findBadgeNumberConflict, releaseTerminatedBadgeNumber, releaseTerminatedBadgeNumberConflicts } from '@/lib/badge-blacklist'
import {
  collectUsedBadgeInts,
  findNextFreeBadgeFrom,
  findNextFreeBadgeInRange,
  formatBadgeNumber,
  normalizeBadgeNumber,
  parseBadgeNumberToInt,
  rankHasBadgeRange,
  stripTerminatedBadgeNumber,
} from '@/lib/badge-number'
import { getAllowDuplicateBadgeNumbers, getBadgePrefix } from '@/lib/settings-helpers'
import { canCheckDiscordGuildMembers, getDiscordGuildMember, queueDiscordHrEvent, queueOfficerRoleSync, syncFormerOfficerDiscordMember, syncOfficerDiscordRoles } from '@/lib/discord-integration'
import { getOfficerDutyTime, getOfficerPlaytimeReport } from '@/lib/duty-times'
import { syncOfficerPlayerPlaytime } from '@/lib/player-online'
import { getOfficerAbsenceReport, runOfficerStatusAutomation } from '@/lib/absence-status'
import { runSanctionDeadlineAutomation } from '@/lib/sanctions'
import { withOfficerTrainingRows } from '@/lib/officer-trainings'
import { syncLinkedUserDisplayNameForOfficer } from '@/lib/user-display-name'

function validDiscordId(value: string | null | undefined) {
  const id = value?.trim()
  return id && /^\d{17,22}$/.test(id) ? id : ''
}

/**
 * Nächste freie Dienstnummer für die Wiedereinstellung: zuerst im Rangbereich,
 * sonst ab der alten Nummer bzw. dem Bereichsende weiterzählen.
 */
async function findReactivationBadgeNumber(
  rank: { badgeMin: number | null; badgeMax: number | null },
  restoredBadge: string,
  prefix: string,
): Promise<string | null> {
  const [activeOfficers, blacklisted] = await Promise.all([
    prisma.officer.findMany({ where: { status: { not: 'TERMINATED' } }, select: { badgeNumber: true } }),
    prisma.badgeBlacklist.findMany({ select: { badgeNumber: true } }),
  ])
  const used = collectUsedBadgeInts([...activeOfficers, ...blacklisted], prefix)
  let next: number | null = null
  if (rankHasBadgeRange(rank)) {
    next = findNextFreeBadgeInRange(rank.badgeMin, rank.badgeMax, used, null)
    if (next === null) next = findNextFreeBadgeFrom(rank.badgeMax + 1, used)
  } else {
    const restoredInt = parseBadgeNumberToInt(restoredBadge, prefix)
    next = findNextFreeBadgeFrom(restoredInt !== null ? restoredInt + 1 : 1, used)
  }
  return next !== null ? formatBadgeNumber(next, prefix) : null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('officers:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
  const { id } = await params
  await Promise.all([
    runOfficerStatusAutomation(),
    runSanctionDeadlineAutomation(),
  ])

  const [officer, trainings] = await Promise.all([
    prisma.officer.findUnique({
      where: { id },
      include: {
        rank: true,
        trainings: { include: { training: { include: { minRank: true } } } },
        promotionLogs: {
          include: { oldRank: true, newRank: true, performedBy: { select: { displayName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        terminations: {
          include: { terminatedBy: { select: { displayName: true } } },
          orderBy: { terminatedAt: 'desc' },
        },
        sanctions: {
          include: { issuedBy: { select: { displayName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        officerNotes: {
          include: { author: { select: { displayName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        calendarEvents: {
          where: { startsAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { startsAt: 'desc' },
          take: 10,
        },
        contracts: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            status: true,
            token: true,
            sentAt: true,
            sentVia: true,
            sendCount: true,
            lastSendError: true,
            signedAt: true,
            signedName: true,
            declinedAt: true,
            declineReason: true,
            createdAt: true,
            template: { select: { id: true, name: true } },
          },
        },
        jobApplication: {
          select: {
            id: true,
            applicantDisplayName: true,
            status: true,
            statusText: true,
            submittedAt: true,
            discordId: true,
          },
        },
      },
    }),
    prisma.training.findMany({
      include: { minRank: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  if (!officer) return notFound('Officer')
  const officerWithTrainingRows = withOfficerTrainingRows(officer, trainings)
  const hireAudit = await prisma.auditLog.findFirst({
    where: { officerId: id, action: 'OFFICER_CREATED' },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { displayName: true } } },
  })
  const hiredBy = hireAudit
    ? { displayName: hireAudit.user?.displayName ?? null, createdAt: hireAudit.createdAt }
    : null
  await syncOfficerPlayerPlaytime(id)
  const discordId = validDiscordId(officer.discordId)
  const canCheckDiscordMembers = await canCheckDiscordGuildMembers()
  const [dutyTime, playtime, absences, discordGuildMember] = await Promise.all([
    getOfficerDutyTime(id, { sync: false }),
    getOfficerPlaytimeReport(id, { sync: false }),
    getOfficerAbsenceReport(id),
    canCheckDiscordMembers && discordId ? getDiscordGuildMember(discordId) : Promise.resolve(null),
  ])
  return success({
    ...officerWithTrainingRows,
    hiredBy,
    dutyTime,
    playtime,
    absences,
    discordMember: {
      checked: canCheckDiscordMembers && !!discordId,
      inGuild: !!discordGuildMember,
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['officers:write', 'unit-leadership:manage'])
    const { id } = await params
    const body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Ungültige Anfrage')
    const canWriteOfficer = hasOfficerWriteAccess(user)
    const unitLeadershipOnly = !canWriteOfficer && hasPermission(user, 'unit-leadership:manage')
    if (unitLeadershipOnly) {
      const invalidField = Object.keys(body).find((key) => key !== 'unit' && key !== 'units')
      if (invalidField) return error('Unit-Leitung darf nur Unit-Zuweisungen ändern', 403)
    }

    const parsed = updateOfficerSchema.safeParse(body)
    if (!parsed.success) return error(parsed.error.issues.map(e => e.message).join(', '))

    const existing = await prisma.officer.findUnique({
      where: { id },
      include: {
        rank: true,
        terminations: {
          orderBy: { terminatedAt: 'desc' },
          take: 1,
        },
      },
    })
    if (!existing) return notFound('Officer')

    const prefix = await getBadgePrefix()
    const requestedBadgeNumber = typeof parsed.data.badgeNumber === 'string' && parsed.data.badgeNumber.trim()
      ? normalizeBadgeNumber(stripTerminatedBadgeNumber(parsed.data.badgeNumber), prefix)
      : undefined
    const reactivating = existing.status === 'TERMINATED' && parsed.data.status === 'ACTIVE'
    const restoredBadgeNumber = reactivating
      ? normalizeBadgeNumber(
          existing.terminations[0]?.previousBadgeNumber?.trim() || stripTerminatedBadgeNumber(existing.badgeNumber),
          prefix,
        )
      : undefined
    let nextBadgeNumber = requestedBadgeNumber || restoredBadgeNumber

    if (nextBadgeNumber && nextBadgeNumber !== existing.badgeNumber) {
      const allowDuplicateBadgeNumbers = await getAllowDuplicateBadgeNumbers()
      let badgeConflict = await findBadgeNumberConflict(nextBadgeNumber, prefix, id, { allowOfficerDuplicate: allowDuplicateBadgeNumbers })
      if (badgeConflict && reactivating && !requestedBadgeNumber) {
        // Alte Dienstnummer ist inzwischen vergeben/gesperrt → nächste freie Nummer vergeben
        const fallback = await findReactivationBadgeNumber(existing.rank, nextBadgeNumber, prefix)
        if (fallback) {
          nextBadgeNumber = fallback
          badgeConflict = null
        }
      }
      if (badgeConflict) return error(badgeConflict)
      await releaseTerminatedBadgeNumberConflicts(nextBadgeNumber, prefix)
    }

    if ('discordId' in parsed.data && parsed.data.discordId && parsed.data.discordId !== existing.discordId) {
      const dup = await prisma.officer.findFirst({
        where: { discordId: parsed.data.discordId, NOT: { id } },
      })
      if (dup) return error('Discord-ID bereits vergeben')
    }

    const unitKeys = 'units' in parsed.data
      ? normalizeUnitKeys(parsed.data.units)
      : ('unit' in parsed.data && parsed.data.unit ? normalizeUnitKeys([parsed.data.unit]) : undefined)
    if (unitKeys && unitKeys.length > 0) {
      const activeUnits = await prisma.unit.findMany({ where: { key: { in: unitKeys }, active: true } })
      const activeKeys = new Set(activeUnits.map((unit) => unit.key))
      const missing = unitKeys.find((key) => !activeKeys.has(key))
      if (missing) return error('Unit nicht gefunden')
    }

    if (unitLeadershipOnly) {
      if (unitKeys === undefined) return error('Unit-Zuweisung ist erforderlich')
      const managedUnitKeys = await getManagedUnitKeysForUser(user)
      const leadershipError = unitLeadershipChangeError(officerUnitKeys(existing), unitKeys, managedUnitKeys)
      if (leadershipError) return error(leadershipError, 403)
    }

    const data: Record<string, unknown> = { ...parsed.data }
    if (data.badgeNumber === null || data.badgeNumber === '') delete data.badgeNumber
    delete data.unit
    delete data.units
    if (unitKeys) {
      data.unit = unitKeys[0] ?? null
      data.units = unitKeys
    }
    if (parsed.data.hireDate) data.hireDate = new Date(parsed.data.hireDate)
    if (nextBadgeNumber && nextBadgeNumber !== existing.badgeNumber) data.badgeNumber = nextBadgeNumber

    const updated = await prisma.officer.update({
      where: { id },
      data,
      include: { rank: true },
    })
    await syncLinkedUserDisplayNameForOfficer(updated)

    if (parsed.data.status === 'TERMINATED' && existing.status !== 'TERMINATED') {
      await releaseTerminatedBadgeNumber(updated)
    }

    const changes: string[] = []
    if (parsed.data.firstName && parsed.data.firstName !== existing.firstName) changes.push(`Vorname: ${existing.firstName} → ${parsed.data.firstName}`)
    if (parsed.data.lastName && parsed.data.lastName !== existing.lastName) changes.push(`Nachname: ${existing.lastName} → ${parsed.data.lastName}`)
    if (nextBadgeNumber && nextBadgeNumber !== existing.badgeNumber) changes.push(`Dienstnummer: ${existing.badgeNumber} → ${nextBadgeNumber}`)
    if (parsed.data.status && parsed.data.status !== existing.status) changes.push(`Status: ${existing.status} → ${parsed.data.status}`)
    if (parsed.data.rankId && parsed.data.rankId !== existing.rankId) changes.push(`Rang geändert`)
    if (unitKeys && JSON.stringify(unitKeys) !== JSON.stringify(officerUnitKeys(existing))) {
      changes.push(`Units: ${officerUnitKeys(existing).join(', ') || '—'} → ${unitKeys.join(', ') || '—'}`)
    }
    if ('flag' in parsed.data && parsed.data.flag !== existing.flag) {
      changes.push(`Markierung: ${existing.flag ?? '—'} → ${parsed.data.flag ?? '—'}`)
    }
    if ('discordId' in parsed.data && parsed.data.discordId !== existing.discordId) {
      changes.push(
        `Discord-ID: ${existing.discordId ?? '—'} → ${parsed.data.discordId ?? '—'}`,
      )
    }

    if (changes.length > 0) {
      await createAuditLog({
        action: 'OFFICER_UPDATED',
        userId: user.id,
        officerId: id,
        details: changes.join('; '),
      })
    }

    const rankChanged = !!parsed.data.rankId && parsed.data.rankId !== existing.rankId
    const nameChanged = (
      (!!parsed.data.firstName && parsed.data.firstName !== existing.firstName) ||
      (!!parsed.data.lastName && parsed.data.lastName !== existing.lastName)
    )
    const badgeChanged = !!nextBadgeNumber && nextBadgeNumber !== existing.badgeNumber
    const unitsChanged = !!unitKeys && JSON.stringify(unitKeys) !== JSON.stringify(officerUnitKeys(existing))
    const discordChanged = 'discordId' in parsed.data && parsed.data.discordId !== existing.discordId
    const statusChanged = !!parsed.data.status && parsed.data.status !== existing.status

    if (discordChanged && existing.discordId) {
      void syncFormerOfficerDiscordMember(existing).catch((syncError) => {
        console.error('[DiscordIntegration] Rollenentzug für alte Discord-ID fehlgeschlagen:', syncError)
      })
    }

    if (rankChanged || nameChanged || badgeChanged || unitsChanged || discordChanged || statusChanged) {
      queueOfficerRoleSync(id, parsed.data.status === 'TERMINATED' ? 'remove-all' : 'sync')
    }

    if (rankChanged || unitsChanged) {
      const previousUnits = officerUnitKeys(existing)
      queueDiscordHrEvent({
        type: rankChanged ? 'promotion' : 'units',
        title: rankChanged && unitsChanged
          ? 'Rang und Unit-Zuordnung geändert'
          : rankChanged
            ? 'Rang geändert'
            : 'Unit-Zuordnung geändert',
        description: unitsChanged
          ? 'Die organisatorische Zuordnung wurde im HR-Panel aktualisiert.'
          : 'Der Rang wurde im HR-Panel aktualisiert.',
        officer: updated,
        actor: user,
        fields: [
          ...(rankChanged ? [
            { name: 'Alter Rang', value: existing.rank.name, inline: true },
            { name: 'Neuer Rang', value: `**${updated.rank.name}**`, inline: true },
          ] : []),
        ],
        unitChange: unitsChanged
          ? { previous: previousUnits, current: unitKeys ?? [] }
          : undefined,
      })
    }

    return success(updated)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Discord-ID bereits vergeben')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN'], ['officers:delete'])
    const { id } = await params

    const officer = await prisma.officer.findUnique({ where: { id }, include: { rank: true } })
    if (!officer) return notFound('Officer')

    await syncOfficerDiscordRoles(id, 'remove-all').catch((syncError) => {
      console.error('[DiscordIntegration] Rollenentzug vor Officer-Löschung fehlgeschlagen:', syncError)
    })

    await prisma.$transaction([
      prisma.termination.updateMany({
        where: { officerId: id },
        data: {
          previousFirstName: officer.firstName,
          previousLastName: officer.lastName,
        },
      }),
      prisma.officer.delete({ where: { id } }),
    ])

    await createAuditLog({
      action: 'OFFICER_DELETED',
      userId: user.id,
      details: `${officer.firstName} ${officer.lastName} (${officer.badgeNumber}) gelöscht`,
    })

    return success({ message: 'Officer gelöscht' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
