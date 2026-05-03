import { prisma } from '@/lib/prisma'
import { clippedSessionDurationMs, endOfWeek, formatDuration, sessionDurationMs, startOfCurrentWeek } from '@/lib/duty-times'

const TOKEN_SETTING_KEY = 'fivem.ingestToken'
const STALE_SESSION_MS = 10 * 60_000

export function fivemTokenConfigured() {
  return !!(process.env.FIVEM_INGEST_TOKEN?.trim() || process.env.LSPD_FIVEM_INGEST_TOKEN?.trim())
}

export async function getFiveMIngestToken() {
  const envToken = process.env.FIVEM_INGEST_TOKEN?.trim() || process.env.LSPD_FIVEM_INGEST_TOKEN?.trim()
  if (envToken) return envToken
  const setting = await prisma.systemSetting.findUnique({ where: { key: TOKEN_SETTING_KEY } })
  return setting?.value.trim() || ''
}

export async function verifyFiveMIngestToken(authHeader: string | null) {
  const expected = await getFiveMIngestToken()
  if (!expected) return false
  const value = authHeader?.trim() || ''
  const token = value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : value
  return token.length > 0 && token === expected
}

function cleanDiscordId(value: unknown) {
  if (typeof value !== 'string') return null
  const id = value.replace(/^discord:/i, '').trim()
  return /^\d{17,22}$/.test(id) ? id : null
}

function cleanString(value: unknown, max: number) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, max) : null
}

function cleanServerId(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return value >= 0 ? value : null
}

async function findOfficerId(discordId: string | null) {
  if (!discordId) return null
  const officer = await prisma.officer.findFirst({
    where: { discordId, status: { not: 'TERMINATED' } },
    select: { id: true },
  })
  return officer?.id ?? null
}

export async function ingestFiveMPlaytime(input: {
  event: unknown
  discordId: unknown
  license: unknown
  playerName: unknown
  sourceServerId: unknown
}) {
  const event = cleanString(input.event, 32)
  const discordId = cleanDiscordId(input.discordId)
  const license = cleanString(input.license, 96)
  const playerName = cleanString(input.playerName, 80) || 'Unbekannt'
  const sourceServerId = cleanServerId(input.sourceServerId)
  const officerId = await findOfficerId(discordId)

  if (!discordId && !license) {
    throw new Error('Discord-ID oder License ist erforderlich')
  }

  const identityWhere = [
    ...(discordId ? [{ discordId }] : []),
    ...(license ? [{ license }] : []),
  ]
  const active = await prisma.playtimeSession.findFirst({
    where: {
      endedAt: null,
      OR: identityWhere,
    },
    orderBy: { startedAt: 'desc' },
  })

  if (event === 'leave') {
    if (!active) return { status: 'ignored' as const }
    const session = await prisma.playtimeSession.update({
      where: { id: active.id },
      data: {
        endedAt: new Date(),
        lastSeenAt: new Date(),
        officerId,
        discordId: discordId ?? active.discordId,
        license: license ?? active.license,
        playerName,
        sourceServerId,
      },
    })
    return { status: 'ended' as const, session }
  }

  if (active) {
    const stale = Date.now() - active.lastSeenAt.getTime() > STALE_SESSION_MS
    if (!stale) {
      const session = await prisma.playtimeSession.update({
        where: { id: active.id },
        data: {
          lastSeenAt: new Date(),
          officerId: officerId ?? active.officerId,
          discordId: discordId ?? active.discordId,
          license: license ?? active.license,
          playerName,
          sourceServerId,
        },
      })
      return { status: 'updated' as const, session }
    }

    await prisma.playtimeSession.update({
      where: { id: active.id },
      data: { endedAt: active.lastSeenAt },
    })
  }

  const session = await prisma.playtimeSession.create({
    data: {
      officerId,
      discordId,
      license,
      playerName,
      sourceServerId,
    },
  })
  return { status: 'started' as const, session }
}

export async function getOfficerPlaytimeReport(officerId: string, now = new Date()) {
  const weekStart = startOfCurrentWeek(now)
  const weekEnd = endOfWeek(weekStart)
  const chartStart = new Date(weekStart.getTime() - 6 * 24 * 60 * 60 * 1000)

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
    durationMs: sessionDurationMs({ clockInAt: session.startedAt, clockOutAt: session.endedAt }, now),
  }))

  const daily = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(weekStart.getTime() + index * 24 * 60 * 60 * 1000)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    const durationMs = sessions.reduce((total, session) => (
      total + clippedSessionDurationMs({ clockInAt: session.startedAt, clockOutAt: session.endedAt }, start, end, now)
    ), 0)
    return {
      date: start,
      label: new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'Europe/Berlin' }).format(start),
      durationMs,
      durationLabel: formatDuration(durationMs),
    }
  })

  return {
    recentSessions,
    daily,
  }
}
