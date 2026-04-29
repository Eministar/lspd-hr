import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { updateOfficerSchema } from '@/lib/validations/officer'
import { createAuditLog } from '@/lib/audit'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { normalizeUnitKeys } from '@/lib/officer-units'

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
  return success(officer)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['officers:write'])
    const { id } = await params
    const body = await req.json()
    const parsed = updateOfficerSchema.safeParse(body)
    if (!parsed.success) return error(parsed.error.issues.map(e => e.message).join(', '))

    const existing = await prisma.officer.findUnique({ where: { id }, include: { rank: true } })
    if (!existing) return notFound('Officer')

    if (parsed.data.badgeNumber && parsed.data.badgeNumber !== existing.badgeNumber) {
      const dup = await prisma.officer.findUnique({ where: { badgeNumber: parsed.data.badgeNumber } })
      if (dup) return error('Dienstnummer bereits vergeben')
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

    const updated = await prisma.officer.update({
      where: { id },
      data,
      include: { rank: true },
    })

    const changes: string[] = []
    if (parsed.data.firstName && parsed.data.firstName !== existing.firstName) changes.push(`Vorname: ${existing.firstName} → ${parsed.data.firstName}`)
    if (parsed.data.lastName && parsed.data.lastName !== existing.lastName) changes.push(`Nachname: ${existing.lastName} → ${parsed.data.lastName}`)
    if (parsed.data.badgeNumber && parsed.data.badgeNumber !== existing.badgeNumber) changes.push(`Dienstnummer: ${existing.badgeNumber} → ${parsed.data.badgeNumber}`)
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
