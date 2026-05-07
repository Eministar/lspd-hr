import { prisma } from '@/lib/prisma'
import {
  syncAllPlayerPlaytime,
  syncOfficerPlayerPlaytime,
  type PlayerOnlinePlayer,
  type PlayerOnlineStatusName,
  type PlayerOnlineSyncResult,
} from '@/lib/player-online'

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

type DurationSession = {
  clockInAt: Date
  clockOutAt: Date | null
}

type PlaytimeSessionRow = {
  id: string
  startedAt: Date
  endedAt: Date | null
  lastSeenAt: Date
  playerName: string
  license: string | null
}

type CurrentPlayer = PlayerOnlinePlayer & {
  source: 'api' | 'session'
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

export function sessionDurationMs(session: DurationSession, now = new Date()) {
  const end = session.clockOutAt ?? now
  return Math.max(0, end.getTime() - session.clockInAt.getTime())
}

export function clippedSessionDurationMs(session: DurationSession, start: Date, end: Date, now = new Date()) {
  const sessionEnd = session.clockOutAt ?? now
  const clippedStart = Math.max(session.clockInAt.getTime(), start.getTime())
  const clippedEnd = Math.min(sessionEnd.getTime(), end.getTime())
  return Math.max(0, clippedEnd - clippedStart)
}

function playtimeDurationMs(session: PlaytimeSessionRow, now = new Date()) {
  return sessionDurationMs({ clockInAt: session.startedAt, clockOutAt: session.endedAt }, now)
}

function clippedPlaytimeDurationMs(session: PlaytimeSessionRow, start: Date, end: Date, now = new Date()) {
  return clippedSessionDurationMs({ clockInAt: session.startedAt, clockOutAt: session.endedAt }, start, end, now)
}

function latestDate(dates: Array<Date | null | undefined>) {
  const timestamps = dates
    .filter((date): date is Date => !!date)
    .map((date) => date.getTime())
  if (timestamps.length === 0) return null
  return new Date(Math.max(...timestamps))
}

function dailyPlaytime(sessions: PlaytimeSessionRow[], weekStart: Date, now: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(weekStart.getTime() + index * MS_PER_DAY)
    const end = new Date(start.getTime() + MS_PER_DAY)
    const durationMs = sessions.reduce((total, session) => (
      total + clippedPlaytimeDurationMs(session, start, end, now)
    ), 0)
    return {
      date: start,
      label: new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'Europe/Berlin' }).format(start),
      durationMs,
      durationLabel: formatDuration(durationMs),
    }
  })
}

function currentPlayerFromSession(session: PlaytimeSessionRow | null, live: PlayerOnlineSyncResult | undefined): CurrentPlayer | null {
  if (live?.player) return { ...live.player, source: 'api' }
  if (!session) return null
  return {
    source: 'session',
    name: session.playerName,
    identifier: session.license,
    steamId: null,
    job: null,
    ping: null,
    playtimeSeconds: null,
    connectedAt: session.startedAt,
  }
}

function aggregatePlaytime(sessions: PlaytimeSessionRow[], weekStart: Date, weekEnd: Date, now: Date) {
  const weekDurationMs = sessions.reduce((total, session) => (
    total + clippedPlaytimeDurationMs(session, weekStart, weekEnd, now)
  ), 0)
  const durations = sessions.map((session) => playtimeDurationMs(session, now))
  const sessionCount = sessions.length
  const longestSessionMs = durations.length > 0 ? Math.max(...durations) : 0
  const averageSessionMs = sessionCount > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / sessionCount) : 0

  return {
    weekDurationMs,
    sessionCount,
    longestSessionMs,
    averageSessionMs,
    daily: dailyPlaytime(sessions, weekStart, now),
    lastSeenAt: latestDate(sessions.map((session) => session.lastSeenAt)),
  }
}

export async function getDutyTimesSnapshot(now = new Date()) {
  const sync = await syncAllPlayerPlaytime({ now })
  const weekStart = startOfCurrentWeek(now)
  const weekEnd = endOfWeek(weekStart)
  const statusByOfficerId = new Map(sync.results.map((result) => [result.officerId, result]))

  const officers = await prisma.officer.findMany({
    where: { status: { not: 'TERMINATED' } },
    select: {
      id: true,
      badgeNumber: true,
      firstName: true,
      lastName: true,
      discordId: true,
      status: true,
      lastOnline: true,
      rank: { select: { name: true, color: true, sortOrder: true } },
      playtimeSessions: {
        where: {
          startedAt: { lt: weekEnd },
          OR: [
            { endedAt: null },
            { endedAt: { gte: weekStart } },
          ],
        },
        orderBy: { startedAt: 'desc' },
      },
    },
    orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
  })

  const rows = officers.map((officer) => {
    const live = statusByOfficerId.get(officer.id)
    const activePlaySession = officer.playtimeSessions.find((session) => !session.endedAt) ?? null
    const currentDurationMs = activePlaySession ? playtimeDurationMs(activePlaySession, now) : 0
    const stats = aggregatePlaytime(officer.playtimeSessions, weekStart, weekEnd, now)
    const currentPlayer = currentPlayerFromSession(activePlaySession, live)
    const apiStatus: PlayerOnlineStatusName = !sync.configured
      ? 'not-configured'
      : live?.status ?? (officer.discordId ? 'offline' : 'not-linked')

    return {
      id: officer.id,
      badgeNumber: officer.badgeNumber,
      firstName: officer.firstName,
      lastName: officer.lastName,
      discordId: officer.discordId,
      status: officer.status,
      rank: officer.rank,
      activeSession: activePlaySession
        ? {
          id: activePlaySession.id,
          clockInAt: activePlaySession.startedAt,
          currentDurationMs,
        }
        : null,
      activePlaySession: activePlaySession
        ? {
          id: activePlaySession.id,
          startedAt: activePlaySession.startedAt,
          currentDurationMs,
          playerName: activePlaySession.playerName,
          license: activePlaySession.license,
          lastSeenAt: activePlaySession.lastSeenAt,
        }
        : null,
      currentPlayer,
      online: apiStatus === 'online',
      scriptConnected: live?.scriptConnected ?? !!activePlaySession,
      lastHeartbeat: live?.lastHeartbeat ?? activePlaySession?.lastSeenAt ?? null,
      apiStatus,
      apiError: live?.error,
      weekDurationMs: stats.weekDurationMs,
      playtimeWeekDurationMs: stats.weekDurationMs,
      sessionCount: stats.sessionCount,
      averageSessionMs: stats.averageSessionMs,
      longestSessionMs: stats.longestSessionMs,
      lastSeenAt: latestDate([live?.lastHeartbeat, activePlaySession?.lastSeenAt, officer.lastOnline, stats.lastSeenAt]),
      daily: stats.daily,
    }
  })

  const activeRows = rows.filter((row) => row.apiStatus === 'online' && row.activePlaySession)
  const totalActiveDurationMs = activeRows.reduce((total, row) => total + (row.activePlaySession?.currentDurationMs ?? 0), 0)
  const totalWeekDurationMs = rows.reduce((total, row) => total + row.weekDurationMs, 0)
  const totalSessionCount = rows.reduce((total, row) => total + row.sessionCount, 0)
  const longestSessionMs = rows.reduce((max, row) => Math.max(max, row.longestSessionMs), 0)
  const topRows = [...rows]
    .sort((a, b) => b.weekDurationMs - a.weekDurationMs)
    .slice(0, 8)

  return {
    now,
    weekStart,
    weekEnd,
    sync,
    activeCount: activeRows.length,
    totalActiveDurationMs,
    totalWeekDurationMs,
    totalPlaytimeWeekDurationMs: totalWeekDurationMs,
    totalSessionCount,
    averageSessionMs: totalSessionCount > 0 ? Math.round(totalWeekDurationMs / totalSessionCount) : 0,
    longestSessionMs,
    rows,
    activeRows,
    topRows,
  }
}

export async function getOfficerDutyTime(officerId: string, options?: { now?: Date; sync?: boolean }) {
  const now = options?.now ?? new Date()
  if (options?.sync !== false) await syncOfficerPlayerPlaytime(officerId, { now })
  const weekStart = startOfCurrentWeek(now)
  const weekEnd = endOfWeek(weekStart)

  const playtimeSessions = await prisma.playtimeSession.findMany({
    where: {
      officerId,
      startedAt: { lt: weekEnd },
      OR: [
        { endedAt: null },
        { endedAt: { gte: weekStart } },
      ],
    },
    orderBy: { startedAt: 'desc' },
  })
  const activePlaySession = playtimeSessions.find((session) => !session.endedAt) ?? null
  const currentDurationMs = activePlaySession ? playtimeDurationMs(activePlaySession, now) : 0
  const stats = aggregatePlaytime(playtimeSessions, weekStart, weekEnd, now)

  return {
    activeSession: activePlaySession
      ? {
        id: activePlaySession.id,
        clockInAt: activePlaySession.startedAt,
        currentDurationMs,
      }
      : null,
    activePlaySession: activePlaySession
      ? {
        id: activePlaySession.id,
        startedAt: activePlaySession.startedAt,
        currentDurationMs,
        playerName: activePlaySession.playerName,
        license: activePlaySession.license,
        lastSeenAt: activePlaySession.lastSeenAt,
      }
      : null,
    weekDurationMs: stats.weekDurationMs,
    playtimeWeekDurationMs: stats.weekDurationMs,
    sessionCount: stats.sessionCount,
    averageSessionMs: stats.averageSessionMs,
    longestSessionMs: stats.longestSessionMs,
    lastSeenAt: stats.lastSeenAt,
  }
}

export async function getOfficerPlaytimeReport(officerId: string, options?: { now?: Date; sync?: boolean }) {
  const now = options?.now ?? new Date()
  if (options?.sync !== false) await syncOfficerPlayerPlaytime(officerId, { now })
  const weekStart = startOfCurrentWeek(now)
  const weekEnd = endOfWeek(weekStart)
  const chartStart = new Date(weekStart.getTime() - 6 * MS_PER_DAY)

  const sessions = await prisma.playtimeSession.findMany({
    where: {
      officerId,
      startedAt: { lt: weekEnd },
      OR: [
        { endedAt: null },
        { endedAt: { gte: chartStart } },
      ],
    },
    orderBy: { startedAt: 'desc' },
    take: 80,
  })

  const recentSessions = sessions.slice(0, 12).map((session) => ({
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    lastSeenAt: session.lastSeenAt,
    playerName: session.playerName,
    license: session.license,
    durationMs: playtimeDurationMs(session, now),
  }))

  return {
    recentSessions,
    daily: dailyPlaytime(sessions, weekStart, now),
  }
}
