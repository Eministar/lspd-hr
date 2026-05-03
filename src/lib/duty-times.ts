import { prisma } from '@/lib/prisma'

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

export type DutySource = 'dashboard' | 'discord'

type DutySessionRow = {
  clockInAt: Date
  clockOutAt: Date | null
}

export function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / MS_PER_MINUTE))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

export function startOfCurrentWeek(date = new Date()) {
  const start = new Date(date)
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return start
}

export function endOfWeek(weekStart: Date) {
  return new Date(weekStart.getTime() + 7 * MS_PER_DAY)
}

export function sessionDurationMs(session: DutySessionRow, now = new Date()) {
  const end = session.clockOutAt ?? now
  return Math.max(0, end.getTime() - session.clockInAt.getTime())
}

export function clippedSessionDurationMs(session: DutySessionRow, start: Date, end: Date, now = new Date()) {
  const sessionEnd = session.clockOutAt ?? now
  const clippedStart = Math.max(session.clockInAt.getTime(), start.getTime())
  const clippedEnd = Math.min(sessionEnd.getTime(), end.getTime())
  return Math.max(0, clippedEnd - clippedStart)
}

export async function getDutyTimesSnapshot(now = new Date()) {
  const weekStart = startOfCurrentWeek(now)
  const weekEnd = endOfWeek(weekStart)

  const officers = await prisma.officer.findMany({
    where: { status: { not: 'TERMINATED' } },
    select: {
      id: true,
      badgeNumber: true,
      firstName: true,
      lastName: true,
      discordId: true,
      status: true,
      rank: { select: { name: true, color: true, sortOrder: true } },
      dutySessions: {
        where: {
          clockInAt: { lt: weekEnd },
          OR: [
            { clockOutAt: null },
            { clockOutAt: { gte: weekStart } },
          ],
        },
        orderBy: { clockInAt: 'desc' },
      },
    },
    orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
  })

  const rows = officers.map((officer) => {
    const activeSession = officer.dutySessions.find((session) => !session.clockOutAt) ?? null
    const weekDurationMs = officer.dutySessions.reduce(
      (total, session) => total + clippedSessionDurationMs(session, weekStart, weekEnd, now),
      0,
    )

    return {
      id: officer.id,
      badgeNumber: officer.badgeNumber,
      firstName: officer.firstName,
      lastName: officer.lastName,
      discordId: officer.discordId,
      status: officer.status,
      rank: officer.rank,
      activeSession: activeSession
        ? {
          id: activeSession.id,
          clockInAt: activeSession.clockInAt,
          currentDurationMs: sessionDurationMs(activeSession, now),
        }
        : null,
      weekDurationMs,
    }
  })

  const activeRows = rows.filter((row) => row.activeSession)
  const totalActiveDurationMs = activeRows.reduce((total, row) => total + (row.activeSession?.currentDurationMs ?? 0), 0)
  const totalWeekDurationMs = rows.reduce((total, row) => total + row.weekDurationMs, 0)

  return {
    now,
    weekStart,
    weekEnd,
    activeCount: activeRows.length,
    totalActiveDurationMs,
    totalWeekDurationMs,
    rows,
    activeRows,
  }
}

export async function getOfficerDutyTime(officerId: string, now = new Date()) {
  const weekStart = startOfCurrentWeek(now)
  const weekEnd = endOfWeek(weekStart)
  const sessions = await prisma.dutyTimeSession.findMany({
    where: {
      officerId,
      clockInAt: { lt: weekEnd },
      OR: [
        { clockOutAt: null },
        { clockOutAt: { gte: weekStart } },
      ],
    },
    orderBy: { clockInAt: 'desc' },
  })
  const activeSession = sessions.find((session) => !session.clockOutAt) ?? null
  return {
    activeSession: activeSession
      ? {
        id: activeSession.id,
        clockInAt: activeSession.clockInAt,
        currentDurationMs: sessionDurationMs(activeSession, now),
      }
      : null,
    weekDurationMs: sessions.reduce(
      (total, session) => total + clippedSessionDurationMs(session, weekStart, weekEnd, now),
      0,
    ),
  }
}

export async function clockInOfficer(officerId: string, source: DutySource, actorDiscordId?: string | null) {
  const officer = await prisma.officer.findUnique({
    where: { id: officerId },
    include: { rank: true },
  })
  if (!officer) throw new Error('Officer nicht gefunden')
  if (officer.status === 'TERMINATED') throw new Error('Gekündigte Officers können nicht eingestempelt werden')

  const active = await prisma.dutyTimeSession.findFirst({
    where: { officerId, clockOutAt: null },
  })
  if (active) throw new Error('Officer ist bereits eingestempelt')

  const session = await prisma.dutyTimeSession.create({
    data: {
      officerId,
      clockInSource: source,
      actorDiscordId: actorDiscordId ?? null,
    },
  })

  return { officer, session }
}

export async function clockOutOfficer(officerId: string, source: DutySource, actorDiscordId?: string | null) {
  const officer = await prisma.officer.findUnique({
    where: { id: officerId },
    include: { rank: true },
  })
  if (!officer) throw new Error('Officer nicht gefunden')

  const active = await prisma.dutyTimeSession.findFirst({
    where: { officerId, clockOutAt: null },
    orderBy: { clockInAt: 'desc' },
  })
  if (!active) throw new Error('Officer ist nicht eingestempelt')

  const session = await prisma.dutyTimeSession.update({
    where: { id: active.id },
    data: {
      clockOutAt: new Date(),
      clockOutSource: source,
      actorDiscordId: actorDiscordId ?? active.actorDiscordId,
    },
  })

  return { officer, session, durationMs: sessionDurationMs(session) }
}
