import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'

const boardInclude = {
  createdBy: { select: { id: true, displayName: true } },
  patrols: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      members: {
        orderBy: [{ sortOrder: 'asc' as const }, { assignedAt: 'asc' as const }],
        include: {
          officer: {
            select: {
              id: true,
              badgeNumber: true,
              firstName: true,
              lastName: true,
              rank: { select: { id: true, name: true, color: true, sortOrder: true } },
            },
          },
        },
      },
    },
  },
}

type PatrolPayload = {
  name?: unknown
  callSign?: unknown
  assignment?: unknown
  notes?: unknown
  memberIds?: unknown
  status?: unknown
  scope?: unknown
  assignedDispatchId?: unknown
}

function isRookieRank(rankName: string | null | undefined) {
  return rankName?.trim().toLowerCase() === 'rookie'
}

function decorateBoard<T extends { patrols: Array<{ members: Array<{ officer: { rank: { name: string } } }> }> }>(board: T) {
  return {
    ...board,
    patrols: board.patrols.map((patrol) => ({
      ...patrol,
      members: patrol.members.map((member) => ({
        ...member,
        officer: {
          ...member.officer,
          isRookie: isRookieRank(member.officer.rank.name),
        },
      })),
    })),
  }
}

function stringOrNull(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function intOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return null
}

function normalizePatrols(value: unknown) {
  if (!Array.isArray(value)) return null
  return value.map((raw, index) => {
    const patrol = raw as PatrolPayload
    const name = stringOrNull(patrol.name) ?? `Streife ${index + 1}`
    const memberIds = Array.isArray(patrol.memberIds)
      ? patrol.memberIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : []

    return {
      name,
      callSign: stringOrNull(patrol.callSign),
      assignment: stringOrNull(patrol.assignment),
      notes: stringOrNull(patrol.notes),
      memberIds,
      sortOrder: index,
      status: intOrNull(patrol.status),
      scope: stringOrNull(patrol.scope),
      assignedDispatchId: intOrNull(patrol.assignedDispatchId),
    }
  })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(undefined, ['patrol-board:view'])
    const { id } = await params
    const board = await prisma.patrolBoard.findUnique({
      where: { id },
      include: boardInclude,
    })
    if (!board) return notFound('Streifenliste')
    return success(decorateBoard(board))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const { id } = await params
    const body = await req.json()

    const existing = await prisma.patrolBoard.findUnique({ where: { id } })
    if (!existing) return notFound('Streifenliste')

    const patrols = normalizePatrols(body.patrols)
    if (!patrols) return error('Streifen sind erforderlich')
    if (patrols.length > 30) return error('Maximal 30 Streifen pro Liste')

    const allMemberIds = patrols.flatMap((patrol) => patrol.memberIds)
    const duplicateOfficerId = allMemberIds.find((officerId, index) => allMemberIds.indexOf(officerId) !== index)
    if (duplicateOfficerId) return error('Ein Officer darf nur in einer Streife eingeteilt sein')

    const oversized = patrols.find((patrol) => patrol.memberIds.length > 3)
    if (oversized) return error(`${oversized.name} hat mehr als 3 Mitglieder`)

    const officers = allMemberIds.length > 0
      ? await prisma.officer.findMany({
        where: { id: { in: allMemberIds }, status: { not: 'TERMINATED' } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          badgeNumber: true,
          rank: { select: { name: true } },
        },
      })
      : []

    if (officers.length !== new Set(allMemberIds).size) {
      return error('Mindestens ein Officer wurde nicht gefunden oder ist gekündigt')
    }

    const officersById = new Map(officers.map((officer) => [officer.id, officer]))
    const ruleViolations: string[] = []
    for (const patrol of patrols) {
      if (patrol.memberIds.length === 1) {
        ruleViolations.push(`${patrol.name}: ein Officer alleine`)
      }
      const rookies = patrol.memberIds
        .map((officerId) => officersById.get(officerId))
        .filter((officer): officer is NonNullable<typeof officer> => !!officer && isRookieRank(officer.rank.name))
      if (rookies.length >= 2) {
        ruleViolations.push(`${patrol.name}: mehrere Rookies zusammen`)
      }
    }

    if (ruleViolations.length > 0 && body.confirmRuleViolations !== true) {
      return error(`Streifenregel prüfen: ${ruleViolations.join(', ')}. Erneut speichern bestätigt die Ausnahme.`)
    }

    const data: Record<string, unknown> = {}
    if (typeof body.title === 'string') {
      const title = body.title.trim()
      if (!title) return error('Titel darf nicht leer sein')
      data.title = title
    }
    if (typeof body.startsAt === 'string') {
      const startsAt = new Date(body.startsAt)
      if (Number.isNaN(startsAt.getTime())) return error('Ungültiges Datum')
      data.startsAt = startsAt
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.patrolUnit.deleteMany({ where: { boardId: id } })

      return tx.patrolBoard.update({
        where: { id },
        data: {
          ...data,
          patrols: {
            create: patrols.map((patrol) => ({
              name: patrol.name,
              callSign: patrol.callSign,
              assignment: patrol.assignment,
              notes: patrol.notes,
              sortOrder: patrol.sortOrder,
              status: patrol.status,
              scope: patrol.scope,
              assignedDispatchId: patrol.assignedDispatchId,
              members: {
                create: patrol.memberIds.map((officerId, memberIndex) => ({
                  officerId,
                  sortOrder: memberIndex,
                })),
              },
            })),
          },
        },
        include: boardInclude,
      })
    })

    await createAuditLog({
      action: 'PATROL_BOARD_UPDATED',
      userId: user.id,
      details: updated.title,
    })

    return success(decorateBoard(updated))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const { id } = await params
    const board = await prisma.patrolBoard.findUnique({ where: { id } })
    if (!board) return notFound('Streifenliste')

    await prisma.patrolBoard.delete({ where: { id } })
    await createAuditLog({
      action: 'PATROL_BOARD_DELETED',
      userId: user.id,
      details: board.title,
    })

    return success({ message: 'Streifenliste gelöscht' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
