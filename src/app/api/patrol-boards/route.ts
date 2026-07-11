import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { getDutyTimesSnapshot } from '@/lib/duty-times'

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

function defaultBoardTitle(startsAt: Date) {
  return `Streifenliste ${startsAt.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  })}`
}

export async function GET() {
  try {
    await requirePermission('patrol-board:view')
    const [boards, dutySnapshot, dispatchCenters] = await Promise.all([
      prisma.patrolBoard.findMany({
        include: boardInclude,
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      }),
      getDutyTimesSnapshot(new Date(), { sync: false }),
      prisma.dispatchCenterState.findMany({
        include: { officer: { select: { id: true, firstName: true, lastName: true, badgeNumber: true } } },
      }),
    ])

    const decoratedBoards = boards.map(decorateBoard)
    const activeDutyOfficers = dutySnapshot.activeRows.map((officer) => ({
      id: officer.id,
      badgeNumber: officer.badgeNumber,
      firstName: officer.firstName,
      lastName: officer.lastName,
      rank: officer.rank,
      isRookie: isRookieRank(officer.rank.name),
      activeSince: officer.activePlaySession?.startedAt ?? null,
      playerName: officer.currentPlayer?.name ?? officer.activePlaySession?.playerName ?? null,
    }))

    return success({
      activeBoard: decoratedBoards[0] ?? null,
      boards: decoratedBoards,
      activeDutyOfficers,
      syncedAt: dutySnapshot.sync.checkedAt,
      dispatchCenters,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const body = await req.json()
    const startsAt = body.startsAt ? new Date(String(body.startsAt)) : new Date()
    if (Number.isNaN(startsAt.getTime())) return error('Ungültiges Datum')

    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : defaultBoardTitle(startsAt)

    const board = await prisma.patrolBoard.create({
      data: {
        title,
        startsAt,
        createdById: user.id,
        patrols: {
          create: [1, 2, 3].map((number, index) => ({
            name: `Streife ${number}`,
            callSign: `S-${number}`,
            sortOrder: index,
          })),
        },
      },
      include: boardInclude,
    })

    await createAuditLog({
      action: 'PATROL_BOARD_CREATED',
      userId: user.id,
      details: title,
    })

    return success(decorateBoard(board), 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
