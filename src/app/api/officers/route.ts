import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createOfficerSchema } from '@/lib/validations/officer'
import { createAuditLog } from '@/lib/audit'
import { isUniqueConstraintError } from '@/lib/prisma-errors'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

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

    const existingBadge = await prisma.officer.findUnique({ where: { badgeNumber: parsed.data.badgeNumber } })
    if (existingBadge) return error('Dienstnummer bereits vergeben')

    const did = parsed.data.discordId ?? null
    if (did) {
      const existingDiscord = await prisma.officer.findFirst({ where: { discordId: did } })
      if (existingDiscord) return error('Discord-ID bereits vergeben')
    }

    const unitKey = parsed.data.unit ?? null
    if (unitKey) {
      const unit = await prisma.unit.findUnique({ where: { key: unitKey } })
      if (!unit || !unit.active) return error('Unit nicht gefunden')
    }

    const officer = await prisma.officer.create({
      data: {
        badgeNumber: parsed.data.badgeNumber,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        rankId: parsed.data.rankId,
        discordId: did,
        notes: parsed.data.notes || null,
        hireDate: parsed.data.hireDate ? new Date(parsed.data.hireDate) : new Date(),
        status: parsed.data.status || 'ACTIVE',
        unit: unitKey,
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
