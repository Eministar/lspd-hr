import { prisma } from '@/lib/prisma'
import { endActiveAbsencesForOfficer, runOfficerStatusAutomation } from '@/lib/absence-status'

const DEFAULT_PLAYER_ONLINE_API_URL = 'https://dash.nero-v.cc/api/external/player-online'
const DEFAULT_POLICE_JOB = 'police'
const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_SYNC_TTL_MS = 5_000
const DEFAULT_CONCURRENCY = 8

export type PlayerOnlineStatusName = 'online' | 'offline' | 'ignored-job' | 'not-linked' | 'not-configured' | 'error'

export type PlayerOnlinePlayer = {
  name: string
  identifier: string | null
  steamId: string | null
  job: string | null
  ping: number | null
  playtimeSeconds: number | null
  connectedAt: Date | null
}

export type PlayerOnlineSyncResult = {
  officerId: string
  discordId: string | null
  status: PlayerOnlineStatusName
  online: boolean
  scriptConnected: boolean
  lastHeartbeat: Date | null
  player: PlayerOnlinePlayer | null
  endedAbsences: number
  error?: string
}

export type PlayerOnlineSyncSummary = {
  configured: boolean
  checkedAt: Date
  onlineCount: number
  errorCount: number
  results: PlayerOnlineSyncResult[]
}

type OfficerForPlayerSync = {
  id: string
  discordId: string | null
}

type RawPlayerOnlineResponse = {
  discordId?: unknown
  online?: unknown
  scriptConnected?: unknown
  lastHeartbeat?: unknown
  player?: unknown
}

type RawPlayer = {
  name?: unknown
  identifier?: unknown
  steamId?: unknown
  job?: unknown
  ping?: unknown
  playtimeSeconds?: unknown
  connectedAt?: unknown
}

let lastAllSyncAt = 0
let lastAllSync: PlayerOnlineSyncSummary | null = null
let activeAllSync: Promise<PlayerOnlineSyncSummary> | null = null

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

function envNumber(names: string[], fallback: number) {
  const value = envValue(...names)
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function playerOnlineApiSecret() {
  return envValue('PLAYER_ONLINE_API_SECRET', 'LSPD_PLAYER_ONLINE_API_SECRET', 'NEROV_PLAYER_ONLINE_API_SECRET')
}

function playerOnlineApiUrl() {
  const raw = envValue('PLAYER_ONLINE_API_URL', 'LSPD_PLAYER_ONLINE_API_URL', 'NEROV_PLAYER_ONLINE_API_URL') || DEFAULT_PLAYER_ONLINE_API_URL
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function policeJob() {
  return (envValue('PLAYER_ONLINE_POLICE_JOB', 'LSPD_PLAYER_ONLINE_POLICE_JOB') || DEFAULT_POLICE_JOB).toLowerCase()
}

function playerOnlineTimeoutMs() {
  return envNumber(['PLAYER_ONLINE_API_TIMEOUT_MS', 'LSPD_PLAYER_ONLINE_API_TIMEOUT_MS'], DEFAULT_TIMEOUT_MS)
}

function syncTtlMs() {
  return envNumber(['PLAYER_ONLINE_SYNC_TTL_MS', 'LSPD_PLAYER_ONLINE_SYNC_TTL_MS'], DEFAULT_SYNC_TTL_MS)
}

function syncConcurrency() {
  return Math.min(envNumber(['PLAYER_ONLINE_SYNC_CONCURRENCY', 'LSPD_PLAYER_ONLINE_SYNC_CONCURRENCY'], DEFAULT_CONCURRENCY), 20)
}

export function playerOnlineApiConfigured() {
  return !!playerOnlineApiSecret()
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

function cleanInt(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const int = Math.round(value)
  return int >= 0 ? int : null
}

function cleanDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizePlayer(value: unknown): PlayerOnlinePlayer | null {
  if (!value || typeof value !== 'object') return null
  const player = value as RawPlayer
  const name = cleanString(player.name, 80)
  if (!name) return null

  return {
    name,
    identifier: cleanString(player.identifier, 96),
    steamId: cleanString(player.steamId, 64),
    job: cleanString(player.job, 64),
    ping: cleanInt(player.ping),
    playtimeSeconds: cleanInt(player.playtimeSeconds),
    connectedAt: cleanDate(player.connectedAt),
  }
}

function isPolicePlayer(player: PlayerOnlinePlayer | null) {
  return (player?.job ?? '').trim().toLowerCase() === policeJob()
}

function sessionStartFromPlayer(player: PlayerOnlinePlayer, now: Date) {
  if (player.connectedAt) return player.connectedAt
  if (player.playtimeSeconds && player.playtimeSeconds > 0) {
    return new Date(now.getTime() - player.playtimeSeconds * 1000)
  }
  return now
}

function sessionEndFromStatus(status: { lastHeartbeat: Date | null }, now: Date) {
  if (status.lastHeartbeat && status.lastHeartbeat.getTime() <= now.getTime()) return status.lastHeartbeat
  return now
}

async function fetchPlayerOnline(discordId: string): Promise<{
  discordId: string
  online: boolean
  scriptConnected: boolean
  lastHeartbeat: Date | null
  player: PlayerOnlinePlayer | null
  treatAsOffline?: boolean
}> {
  const secret = playerOnlineApiSecret()
  if (!secret) throw new Error('Player-Online API-Secret fehlt')

  const url = new URL(playerOnlineApiUrl())
  url.searchParams.set('discordId', discordId)

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-api-secret': secret },
    cache: 'no-store',
    signal: AbortSignal.timeout(playerOnlineTimeoutMs()),
  })

  if (res.status === 403 || res.status === 404) {
    return {
      discordId,
      online: false,
      scriptConnected: false,
      lastHeartbeat: null,
      player: null,
      treatAsOffline: true,
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Player-Online API ${res.status}: ${text.slice(0, 180) || res.statusText}`)
  }

  const body = await res.json() as RawPlayerOnlineResponse
  return {
    discordId: cleanDiscordId(body.discordId) ?? discordId,
    online: body.online === true,
    scriptConnected: body.scriptConnected === true,
    lastHeartbeat: cleanDate(body.lastHeartbeat),
    player: normalizePlayer(body.player),
  }
}

async function endActivePlaytime(officer: OfficerForPlayerSync, endedAt: Date) {
  await prisma.playtimeSession.updateMany({
    where: {
      endedAt: null,
      OR: [
        { officerId: officer.id },
        ...(officer.discordId ? [{ discordId: officer.discordId }] : []),
      ],
    },
    data: {
      endedAt,
      lastSeenAt: endedAt,
    },
  })
}

async function upsertActivePlaytime(officer: OfficerForPlayerSync, player: PlayerOnlinePlayer, lastSeenAt: Date, now: Date) {
  const startedAt = sessionStartFromPlayer(player, now)
  const active = await prisma.playtimeSession.findFirst({
    where: {
      endedAt: null,
      OR: [
        { officerId: officer.id },
        ...(officer.discordId ? [{ discordId: officer.discordId }] : []),
      ],
    },
    orderBy: { startedAt: 'desc' },
  })

  if (active) {
    const earliestStart = startedAt.getTime() < active.startedAt.getTime() ? startedAt : active.startedAt
    return prisma.playtimeSession.update({
      where: { id: active.id },
      data: {
        officerId: officer.id,
        discordId: officer.discordId,
        license: player.identifier,
        playerName: player.name,
        startedAt: earliestStart,
        lastSeenAt,
      },
    })
  }

  return prisma.playtimeSession.create({
    data: {
      officerId: officer.id,
      discordId: officer.discordId,
      license: player.identifier,
      playerName: player.name,
      startedAt,
      lastSeenAt,
    },
  })
}

async function syncOneOfficerPlaytime(officer: OfficerForPlayerSync, now: Date): Promise<PlayerOnlineSyncResult> {
  if (!officer.discordId) {
    return {
      officerId: officer.id,
      discordId: null,
      status: 'not-linked',
      online: false,
      scriptConnected: false,
      lastHeartbeat: null,
      player: null,
      endedAbsences: 0,
    }
  }

  try {
    const status = await fetchPlayerOnline(officer.discordId)
    const activePolice = status.online && status.scriptConnected && isPolicePlayer(status.player)

    if (!activePolice || !status.player) {
      await endActivePlaytime(officer, sessionEndFromStatus(status, now))
      if (status.lastHeartbeat) {
        await prisma.officer.update({ where: { id: officer.id }, data: { lastOnline: status.lastHeartbeat } })
      }
      return {
        officerId: officer.id,
        discordId: officer.discordId,
        status: status.online && status.scriptConnected ? 'ignored-job' : 'offline',
        online: status.online,
        scriptConnected: status.scriptConnected,
        lastHeartbeat: status.lastHeartbeat,
        player: status.player,
        endedAbsences: 0,
      }
    }

    const lastSeenAt = status.lastHeartbeat ?? now
    await upsertActivePlaytime(officer, status.player, lastSeenAt, now)
    await prisma.officer.update({ where: { id: officer.id }, data: { lastOnline: lastSeenAt } })
    const endedAbsences = await endActiveAbsencesForOfficer(officer.id, now)

    return {
      officerId: officer.id,
      discordId: officer.discordId,
      status: 'online',
      online: true,
      scriptConnected: true,
      lastHeartbeat: status.lastHeartbeat,
      player: status.player,
      endedAbsences,
    }
  } catch (error) {
    return {
      officerId: officer.id,
      discordId: officer.discordId,
      status: 'error',
      online: false,
      scriptConnected: false,
      lastHeartbeat: null,
      player: null,
      endedAbsences: 0,
      error: error instanceof Error ? error.message : 'Player-Online API nicht erreichbar',
    }
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = []
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function syncAllPlayerPlaytime(options?: { force?: boolean; now?: Date }): Promise<PlayerOnlineSyncSummary> {
  const now = options?.now ?? new Date()

  if (!playerOnlineApiConfigured()) {
    return {
      configured: false,
      checkedAt: now,
      onlineCount: 0,
      errorCount: 0,
      results: [],
    }
  }

  if (!options?.force && lastAllSync && Date.now() - lastAllSyncAt < syncTtlMs()) {
    return lastAllSync
  }

  if (!options?.force && activeAllSync) return activeAllSync

  activeAllSync = (async () => {
    const officers = await prisma.officer.findMany({
      where: { status: { not: 'TERMINATED' } },
      select: { id: true, discordId: true },
      orderBy: { badgeNumber: 'asc' },
    })
    const results = await mapWithConcurrency(officers, syncConcurrency(), (officer) => syncOneOfficerPlaytime(officer, now))
    const summary = {
      configured: true,
      checkedAt: now,
      onlineCount: results.filter((result) => result.status === 'online').length,
      errorCount: results.filter((result) => result.status === 'error').length,
      results,
    }

    if (results.some((result) => result.status === 'online' || result.status === 'offline' || result.status === 'ignored-job')) {
      await runOfficerStatusAutomation({ force: true })
    }

    lastAllSync = summary
    lastAllSyncAt = Date.now()
    return summary
  })()

  try {
    return await activeAllSync
  } finally {
    activeAllSync = null
  }
}

export async function syncOfficerPlayerPlaytime(officerId: string, options?: { now?: Date }) {
  const now = options?.now ?? new Date()
  if (!playerOnlineApiConfigured()) return null

  const officer = await prisma.officer.findFirst({
    where: { id: officerId, status: { not: 'TERMINATED' } },
    select: { id: true, discordId: true },
  })
  if (!officer) return null

  const result = await syncOneOfficerPlaytime(officer, now)
  if (result.status !== 'error') await runOfficerStatusAutomation({ force: true })
  return result
}
