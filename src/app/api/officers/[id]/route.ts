import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { updateOfficerSchema } from '@/lib/validations/officer'
import { createAuditLog } from '@/lib/audit'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { normalizeUnitKeys } from '@/lib/officer-units'
import { findBadgeNumberConflict, releaseTerminatedBadgeNumber, releaseTerminatedBadgeNumberConflicts } from '@/lib/badge-blacklist'
import { stripTerminatedBadgeNumber } from '@/lib/badge-number'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { queueDiscordHrEvent, queueOfficerRoleSync, syncFormerOfficerDiscordMember, syncOfficerDiscordRoles } from '@/lib/discord-integration'
import { getOfficerDutyTime } from '@/lib/duty-times'
import { getOfficerPlaytimeReport } from '@/lib/fivem-playtime'
import { getOfficerAbsenceReport, runOfficerStatusAutomation } from '@/lib/absence-status'

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
  await runOfficerStatusAutomation()

  const officer = await prisma.officer.findUnique({
    where: { id },
    include: {
      rank: true,
      trainings: { include: { training: true } },
      promotionLogs: {
        include: { oldRank: true, newRank: true, performedBy: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
      },
      terminations: {
        include: { terminatedBy: { select: { displayName: true } } },
        orderBy: { terminatedAt: 'desc' },
      },
      officerNotes: {
        include: { author: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!officer) return notFound('Officer')
  const [dutyTime, playtime, absences] = await Promise.all([
    getOfficerDutyTime(id),
    getOfficerPlaytimeReport(id),
    getOfficerAbsenceReport(id),
  ])
  return success({ ...officer, dutyTime, playtime, absences })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['officers:write'])
    const { id } = await params
    const body = await req.json()
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

    const requestedBadgeNumber = typeof parsed.data.badgeNumber === 'string' && parsed.data.badgeNumber.trim()
      ? stripTerminatedBadgeNumber(parsed.data.badgeNumber)
      : undefined
    const reactivating = existing.status === 'TERMINATED' && parsed.data.status === 'ACTIVE'
    const restoredBadgeNumber = reactivating
      ? (existing.terminations[0]?.previousBadgeNumber?.trim() || stripTerminatedBadgeNumber(existing.badgeNumber))
      : undefined
    const nextBadgeNumber = requestedBadgeNumber || restoredBadgeNumber

    if (nextBadgeNumber && nextBadgeNumber !== existing.badgeNumber) {
      const prefix = await getBadgePrefix()
      const badgeConflict = await findBadgeNumberConflict(nextBadgeNumber, prefix, id)
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

    if (parsed.data.status === 'TERMINATED' && existing.status !== 'TERMINATED') {
      await releaseTerminatedBadgeNumber(updated)
    }

    const changes: string[] = []
    if (parsed.data.firstName && parsed.data.firstName !== existing.firstName) changes.push(`Vorname: ${existing.firstName} → ${parsed.data.firstName}`)
    if (parsed.data.lastName && parsed.data.lastName !== existing.lastName) changes.push(`Nachname: ${existing.lastName} → ${parsed.data.lastName}`)
    if (nextBadgeNumber && nextBadgeNumber !== existing.badgeNumber) changes.push(`Dienstnummer: ${existing.badgeNumber} → ${nextBadgeNumber}`)
    if (parsed.data.status && parsed.data.status !== existing.status) changes.push(`Status: ${existing.status} → ${parsed.data.status}`)
    if (parsed.data.rankId && parsed.data.rankId !== existing.rankId) changes.push(`Rang geändert`)
    if (unitKeys && JSON.stringify(unitKeys) !== JSON.stringify(normalizeUnitKeys(existing.units))) {
      changes.push(`Units: ${normalizeUnitKeys(existing.units).join(', ') || '—'} → ${unitKeys.join(', ') || '—'}`)
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
    const unitsChanged = !!unitKeys && JSON.stringify(unitKeys) !== JSON.stringify(normalizeUnitKeys(existing.units))
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
      queueDiscordHrEvent({
        type: rankChanged ? 'promotion' : 'units',
        title: rankChanged ? 'Rang geändert' : 'Unit geändert',
        description: 'Aktualisierung über das HR-Panel.',
        officer: updated,
        actor: user,
        fields: [
          ...(rankChanged ? [
            { name: 'Alter Rang', value: existing.rank.name, inline: true },
            { name: 'Neuer Rang', value: `**${updated.rank.name}**`, inline: true },
          ] : []),
          ...(unitsChanged ? [{
            name: 'Units',
            value: `${normalizeUnitKeys(existing.units).join(', ') || '—'}\n→ **${unitKeys?.join(', ') || '—'}**`,
            inline: false,
          }] : []),
        ],
      })
    }

    return success(updated)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Dienstnummer oder Discord-ID bereits vergeben')
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
