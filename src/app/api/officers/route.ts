import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createOfficerSchema } from '@/lib/validations/officer'
import { createAuditLog } from '@/lib/audit'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { nextBadgeForRank } from '@/lib/badge-number'
import { findBadgeNumberConflict, getBlacklistedBadgeRows } from '@/lib/badge-blacklist'
import { normalizeUnitKeys } from '@/lib/officer-units'

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
  const search = searchParams.get('search')
  const status = searchParams.get('status')
  const rankId = searchParams.get('rankId')

  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { badgeNumber: { contains: search } },
      { discordId: { contains: search } },
    ]
  }
  if (status) where.status = status
  else where.status = { not: 'TERMINATED' }
  if (rankId) where.rankId = rankId

  const officers = await prisma.officer.findMany({
    where,
    include: {
      rank: true,
      trainings: { include: { training: true } },
    },
    orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
  })

  return success(officers)
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
    if (!badgeNumber) {
      const allRows = await prisma.officer.findMany({ select: { badgeNumber: true } })
      const blacklistedBadges = await getBlacklistedBadgeRows()
      const assigned = nextBadgeForRank(rank, allRows, prefix, null, blacklistedBadges)
      if (!assigned) return error('Keine freie Dienstnummer im Bereich des ausgewählten Rangs')
      badgeNumber = assigned.str
    }

    const badgeConflict = await findBadgeNumberConflict(badgeNumber, prefix)
    if (badgeConflict) return error(badgeConflict)

    const did = parsed.data.discordId ?? null
    if (did) {
      const existingDiscord = await prisma.officer.findFirst({ where: { discordId: did } })
      if (existingDiscord) return error('Discord-ID bereits vergeben')
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

    const trainings = await prisma.training.findMany()
    if (trainings.length > 0) {
      await prisma.officerTraining.createMany({
        data: trainings.map(t => ({
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

    return success(officer, 201)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Dienstnummer oder Discord-ID bereits vergeben')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
