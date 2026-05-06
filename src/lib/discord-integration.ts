import { prisma } from './prisma'
import { officerUnitKeys } from './officer-units'
import { formatDuration, getDutyTimesSnapshot } from './duty-times'
import { getActiveAbsenceNotices, runOfficerStatusAutomation } from './absence-status'
import { getBadgePrefix, getOrgName } from './settings-helpers'
import { queueDiscordWebhookEvent } from './discord-webhook'

type DiscordRole = {
  id: string
  name: string
  color: number
  position: number
  managed: boolean
}

type DiscordChannel = {
  id: string
  name?: string
  type: number
}

type DiscordField = {
  name: string
  value: string
  inline?: boolean
}

type DiscordGuildMember = {
  roles?: string[]
  nick?: string | null
}

type DiscordConfig = {
  guildId: string
  applicationId: string
  announcementsChannelId: string
  dutyStatusChannelId: string
  dutyAdminLogChannelId: string
  dutyStatusMessageId: string
  absenceStatusChannelId: string
  absenceStatusMessageId: string
  employeeRoleIds: string[]
  commandRoleIds: string[]
  rankRoleMap: Record<string, string>
  trainingRoleMap: Record<string, string>
  unitRoleMap: Record<string, string>
}

type OfficerForDiscord = {
  id: string
  discordId: string | null
  firstName: string
  lastName: string
  badgeNumber: string
  status: string
  units?: unknown
  unit?: string | null
  rankId: string
  rank?: { name: string; color?: string | null } | null
  trainings?: { trainingId: string; completed: boolean; training?: { label: string } | null }[]
}

type UserForDiscord = {
  displayName: string
  discordId?: string | null
}

const API_BASE = 'https://discord.com/api/v10'

export const DISCORD_SETTING_KEYS = {
  guildId: 'discord.guildId',
  applicationId: 'discord.applicationId',
  announcementsChannelId: 'discord.announcementsChannelId',
  dutyStatusChannelId: 'discord.dutyStatusChannelId',
  dutyAdminLogChannelId: 'discord.dutyAdminLogChannelId',
  dutyStatusMessageId: 'discord.dutyStatusMessageId',
  absenceStatusChannelId: 'discord.absenceStatusChannelId',
  absenceStatusMessageId: 'discord.absenceStatusMessageId',
  employeeRoleIds: 'discord.employeeRoleIds',
  commandRoleIds: 'discord.commandRoleIds',
  rankRoleMap: 'discord.rankRoleMap',
  trainingRoleMap: 'discord.trainingRoleMap',
  unitRoleMap: 'discord.unitRoleMap',
} as const

const EVENT_META = {
  hire:        { color: 0x22c55e, accent: '🟢', label: 'Neueinstellung',           section: 'Personalmeldung' },
  promotion:   { color: 0xd4af37, accent: '🟡', label: 'Rangänderung',              section: 'Personalmeldung' },
  training:    { color: 0x3b82f6, accent: '🔵', label: 'Ausbildung aktualisiert',   section: 'Personalmeldung' },
  units:       { color: 0x06b6d4, accent: '🔷', label: 'Unit-Zuordnung geändert',   section: 'Personalmeldung' },
  termination: { color: 0xef4444, accent: '🔴', label: 'Dienstverhältnis beendet',  section: 'Personalmeldung' },
  update:      { color: 0x8b5cf6, accent: '🟣', label: 'Personalakte aktualisiert', section: 'Personalmeldung' },
  dutyIn:      { color: 0x22c55e, accent: '🟢', label: 'Dienstantritt',             section: 'Dienstzeit' },
  dutyOut:     { color: 0xef4444, accent: '🔴', label: 'Dienstende',                section: 'Dienstzeit' },
} as const

const ZWSP = '​'

let syncSchedulerStarted = false
let dutyActivityCheckerStarted = false
let absenceExpiryCheckerStarted = false

const DUTY_INACTIVITY_CHECK_AFTER_MS = Number.parseInt(
  process.env.LSPD_DUTY_INACTIVITY_CHECK_AFTER_MS || `${90 * 60 * 1000}`,
  10,
) || 90 * 60 * 1000
const DUTY_INACTIVITY_CONFIRM_DEADLINE_MS = Number.parseInt(
  process.env.LSPD_DUTY_INACTIVITY_CONFIRM_DEADLINE_MS || `${5 * 60 * 1000}`,
  10,
) || 5 * 60 * 1000
const DUTY_ACTIVITY_CHECK_INTERVAL_MS = Number.parseInt(
  process.env.LSPD_DUTY_ACTIVITY_CHECK_INTERVAL_MS || `${60 * 1000}`,
  10,
) || 60 * 1000
const ABSENCE_EXPIRY_CHECK_INTERVAL_MS = Number.parseInt(
  process.env.LSPD_ABSENCE_EXPIRY_CHECK_INTERVAL_MS || `${60 * 1000}`,
  10,
) || 60 * 1000

/* ── Rate-Limit Queue ────────────────────────────────────────────── */
const MAX_RETRIES = 3
let rateLimitQueue: Promise<void> = Promise.resolve()

function enqueueRateLimited<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    rateLimitQueue = rateLimitQueue.then(async () => {
      try {
        resolve(await fn())
      } catch (err) {
        reject(err)
      }
    })
  })
}

/* ── In-Memory Cache für Guild-Daten ─────────────────────────────── */
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 Minuten

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const guildRolesCache = new Map<string, CacheEntry<DiscordRole[]>>()
const guildChannelsCache = new Map<string, CacheEntry<DiscordChannel[]>>()

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() < entry.expiresAt) return entry.data
  if (entry) cache.delete(key)
  return null
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

export function invalidateDiscordCache() {
  guildRolesCache.clear()
  guildChannelsCache.clear()
}

function botToken() {
  return process.env.DISCORD_BOT_TOKEN?.trim() || process.env.LSPD_DISCORD_BOT_TOKEN?.trim() || ''
}

function envGuildId() {
  return process.env.DISCORD_GUILD_ID?.trim() || process.env.LSPD_DISCORD_GUILD_ID?.trim() || ''
}

function envApplicationId() {
  return (
    process.env.DISCORD_APPLICATION_ID?.trim() ||
    process.env.DISCORD_CLIENT_ID?.trim() ||
    process.env.LSPD_DISCORD_APPLICATION_ID?.trim() ||
    process.env.LSPD_DISCORD_CLIENT_ID?.trim() ||
    ''
  )
}

export function getDiscordApplicationId() {
  return envApplicationId()
}

function envAnnouncementsChannelId() {
  return (
    process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID?.trim() ||
    process.env.DISCORD_CHANNEL_ID?.trim() ||
    process.env.LSPD_DISCORD_ANNOUNCEMENTS_CHANNEL_ID?.trim() ||
    process.env.LSPD_DISCORD_CHANNEL_ID?.trim() ||
    ''
  )
}

function envDutyStatusChannelId() {
  return (
    process.env.DISCORD_DUTY_STATUS_CHANNEL_ID?.trim() ||
    process.env.LSPD_DISCORD_DUTY_STATUS_CHANNEL_ID?.trim() ||
    ''
  )
}

function envDutyAdminLogChannelId() {
  return (
    process.env.DISCORD_DUTY_ADMIN_LOG_CHANNEL_ID?.trim() ||
    process.env.LSPD_DISCORD_DUTY_ADMIN_LOG_CHANNEL_ID?.trim() ||
    ''
  )
}

function envAbsenceStatusChannelId() {
  return (
    process.env.DISCORD_ABSENCE_STATUS_CHANNEL_ID?.trim() ||
    process.env.LSPD_DISCORD_ABSENCE_STATUS_CHANNEL_ID?.trim() ||
    ''
  )
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value) as T
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function cleanRoleIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && /^\d{17,22}$/.test(item))))
}

function cleanRoleMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => (
        typeof entry[0] === 'string' &&
        entry[0].trim().length > 0 &&
        typeof entry[1] === 'string' &&
        /^\d{17,22}$/.test(entry[1])
      )),
  )
}

function snowflake(value: string | null | undefined) {
  const id = value?.trim()
  return id && /^\d{17,22}$/.test(id) ? id : ''
}

function officerName(officer: Pick<OfficerForDiscord, 'firstName' | 'lastName'>) {
  return `${officer.firstName} ${officer.lastName}`.trim()
}

function officerBadge(officer: Pick<OfficerForDiscord, 'badgeNumber'>) {
  return officer.badgeNumber.trim()
}

function desiredNickname(officer: Pick<OfficerForDiscord, 'firstName' | 'lastName' | 'badgeNumber'>) {
  const nick = `[LSPD-${officerBadge(officer)}] ${officerName(officer)}`.replace(/\s+/g, ' ').trim()
  return truncate(nick, 32)
}

function mention(discordId: string | null | undefined) {
  const id = snowflake(discordId)
  return id ? `<@${id}>` : 'Nicht verknüpft'
}

export function discordUserLabel(user: UserForDiscord | null | undefined) {
  if (!user) return 'System'
  const id = snowflake(user.discordId)
  return id ? `<@${id}>` : user.displayName
}

function truncate(value: string, max = 1024) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

function unixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000)
}

function discordTimestamp(date: Date, style: 'F' | 'f' | 'R' | 't' | 'D' = 'f') {
  return `<t:${unixSeconds(date)}:${style}>`
}

function cleanEmbedField(field: DiscordField): DiscordField {
  return {
    name: truncate(field.name || ZWSP, 256),
    value: truncate(field.value || '—', 1024),
    inline: field.inline,
  }
}

function hexColorToDiscord(color: string | null | undefined, fallback: number) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return fallback
  return Number.parseInt(color.slice(1), 16)
}

async function discordFetchRaw<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const token = botToken()
  if (!token) throw new Error('Discord Bot-Token fehlt')

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bot ${token}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15000),
  })

  // Rate-Limit: warten und erneut versuchen
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const body = await res.json().catch(() => ({ retry_after: 2 })) as { retry_after?: number }
    const waitMs = Math.min((body.retry_after ?? 2) * 1000, 30000)
    console.warn(`[DiscordIntegration] Rate-Limited auf ${path}, warte ${Math.round(waitMs)}ms (Versuch ${attempt + 1}/${MAX_RETRIES})`)
    await new Promise((r) => setTimeout(r, waitMs + 250))
    return discordFetchRaw<T>(path, init, attempt + 1)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Discord API ${res.status}: ${text || res.statusText}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function discordFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return enqueueRateLimited(() => discordFetchRaw<T>(path, init))
}

export async function getDiscordConfig(): Promise<DiscordConfig> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(DISCORD_SETTING_KEYS) } },
  })
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]))

  return {
    guildId: map[DISCORD_SETTING_KEYS.guildId] || envGuildId(),
    applicationId: map[DISCORD_SETTING_KEYS.applicationId] || envApplicationId(),
    announcementsChannelId: map[DISCORD_SETTING_KEYS.announcementsChannelId] || envAnnouncementsChannelId(),
    dutyStatusChannelId: map[DISCORD_SETTING_KEYS.dutyStatusChannelId] || envDutyStatusChannelId(),
    dutyAdminLogChannelId: map[DISCORD_SETTING_KEYS.dutyAdminLogChannelId] || envDutyAdminLogChannelId(),
    dutyStatusMessageId: map[DISCORD_SETTING_KEYS.dutyStatusMessageId] || '',
    absenceStatusChannelId: map[DISCORD_SETTING_KEYS.absenceStatusChannelId] || envAbsenceStatusChannelId(),
    absenceStatusMessageId: map[DISCORD_SETTING_KEYS.absenceStatusMessageId] || '',
    employeeRoleIds: cleanRoleIds(parseJson(map[DISCORD_SETTING_KEYS.employeeRoleIds], [])),
    commandRoleIds: cleanRoleIds(parseJson(map[DISCORD_SETTING_KEYS.commandRoleIds], [])),
    rankRoleMap: cleanRoleMap(parseJson(map[DISCORD_SETTING_KEYS.rankRoleMap], {})),
    trainingRoleMap: cleanRoleMap(parseJson(map[DISCORD_SETTING_KEYS.trainingRoleMap], {})),
    unitRoleMap: cleanRoleMap(parseJson(map[DISCORD_SETTING_KEYS.unitRoleMap], {})),
  }
}

export async function saveDiscordConfig(input: Partial<DiscordConfig>) {
  const data: Record<string, string> = {}

  if (input.guildId !== undefined) data[DISCORD_SETTING_KEYS.guildId] = input.guildId.trim()
  if (input.applicationId !== undefined) data[DISCORD_SETTING_KEYS.applicationId] = input.applicationId.trim()
  if (input.announcementsChannelId !== undefined) data[DISCORD_SETTING_KEYS.announcementsChannelId] = input.announcementsChannelId.trim()
  if (input.dutyStatusChannelId !== undefined) data[DISCORD_SETTING_KEYS.dutyStatusChannelId] = input.dutyStatusChannelId.trim()
  if (input.dutyAdminLogChannelId !== undefined) data[DISCORD_SETTING_KEYS.dutyAdminLogChannelId] = input.dutyAdminLogChannelId.trim()
  if (input.dutyStatusMessageId !== undefined) data[DISCORD_SETTING_KEYS.dutyStatusMessageId] = input.dutyStatusMessageId.trim()
  if (input.absenceStatusChannelId !== undefined) data[DISCORD_SETTING_KEYS.absenceStatusChannelId] = input.absenceStatusChannelId.trim()
  if (input.absenceStatusMessageId !== undefined) data[DISCORD_SETTING_KEYS.absenceStatusMessageId] = input.absenceStatusMessageId.trim()
  if (input.employeeRoleIds !== undefined) data[DISCORD_SETTING_KEYS.employeeRoleIds] = JSON.stringify(cleanRoleIds(input.employeeRoleIds))
  if (input.commandRoleIds !== undefined) data[DISCORD_SETTING_KEYS.commandRoleIds] = JSON.stringify(cleanRoleIds(input.commandRoleIds))
  if (input.rankRoleMap !== undefined) data[DISCORD_SETTING_KEYS.rankRoleMap] = JSON.stringify(cleanRoleMap(input.rankRoleMap))
  if (input.trainingRoleMap !== undefined) data[DISCORD_SETTING_KEYS.trainingRoleMap] = JSON.stringify(cleanRoleMap(input.trainingRoleMap))
  if (input.unitRoleMap !== undefined) data[DISCORD_SETTING_KEYS.unitRoleMap] = JSON.stringify(cleanRoleMap(input.unitRoleMap))

  const entries = Object.entries(data)
  if (entries.length === 0) return

  await prisma.$transaction(
    entries.map(([key, value]) => (
      prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )),
  )
}

export async function getDiscordGuildRoles(guildId?: string) {
  const config = await getDiscordConfig()
  const id = guildId || config.guildId
  if (!id || !botToken()) return []

  const cached = getCached(guildRolesCache, id)
  if (cached) return cached

  const roles = await discordFetch<DiscordRole[]>(`/guilds/${id}/roles`)
  const seenIds = new Set<string>()

  const result = roles
    .filter((role) => !role.managed && role.name !== '@everyone')
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name))
    .filter((role) => {
      if (seenIds.has(role.id)) return false
      seenIds.add(role.id)
      return true
    })

  setCache(guildRolesCache, id, result)
  return result
}

export async function getDiscordGuildChannels(guildId?: string) {
  const config = await getDiscordConfig()
  const id = guildId || config.guildId
  if (!id || !botToken()) return []

  const cached = getCached(guildChannelsCache, id)
  if (cached) return cached

  const channels = await discordFetch<DiscordChannel[]>(`/guilds/${id}/channels`)
  const result = channels
    .filter((channel) => channel.type === 0 || channel.type === 5 || channel.type === 15)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  setCache(guildChannelsCache, id, result)
  return result
}

async function getOfficerForDiscord(officerId: string) {
  return prisma.officer.findUnique({
    where: { id: officerId },
    include: {
      rank: true,
      trainings: { include: { training: true } },
    },
  })
}

function configuredRoleIds(config: DiscordConfig) {
  return Array.from(new Set([
    ...config.employeeRoleIds,
    ...Object.values(config.rankRoleMap),
    ...Object.values(config.trainingRoleMap),
    ...Object.values(config.unitRoleMap),
  ].filter(Boolean)))
}

function desiredRoleIds(officer: OfficerForDiscord, config: DiscordConfig) {
  if (officer.status === 'TERMINATED') return []

  return Array.from(new Set([
    ...config.employeeRoleIds,
    config.rankRoleMap[officer.rankId],
    ...officerUnitKeys(officer).map((unitKey) => config.unitRoleMap[unitKey]),
    ...(officer.trainings ?? [])
      .filter((training) => training.completed)
      .map((training) => config.trainingRoleMap[training.trainingId]),
  ].filter((roleId): roleId is string => !!roleId)))
}

async function syncOfficerDiscordMember(
  officer: OfficerForDiscord,
  config: DiscordConfig,
  mode: 'sync' | 'remove-all' = 'sync',
) {
  if (!officer?.discordId) return

  const memberId = snowflake(officer.discordId)
  if (!memberId) return

  const allManaged = configuredRoleIds(config)
  const desired = mode === 'remove-all' ? [] : desiredRoleIds(officer, config)
  const member = await discordFetch<DiscordGuildMember>(`/guilds/${config.guildId}/members/${memberId}`).catch(() => null)
  const currentRoles = new Set(member?.roles ?? [])
  const desiredSet = new Set(desired)
  const toAdd = desired.filter((roleId) => !currentRoles.has(roleId))
  const toRemove = allManaged.filter((roleId) => currentRoles.has(roleId) && !desiredSet.has(roleId))

  // Rollen sequentiell verarbeiten um Rate-Limits zu vermeiden
  for (const roleId of toRemove) {
    try {
      await discordFetch<void>(`/guilds/${config.guildId}/members/${memberId}/roles/${roleId}`, { method: 'DELETE' })
    } catch (err) {
      console.error('[DiscordIntegration] Rolle entfernen fehlgeschlagen:', err)
    }
  }
  for (const roleId of toAdd) {
    try {
      await discordFetch<void>(`/guilds/${config.guildId}/members/${memberId}/roles/${roleId}`, { method: 'PUT' })
    } catch (err) {
      console.error('[DiscordIntegration] Rolle hinzufügen fehlgeschlagen:', err)
    }
  }

  if (mode === 'remove-all' && member?.nick !== null) {
    await discordFetch<void>(`/guilds/${config.guildId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ nick: null }),
    }).catch((error) => {
      console.error('[DiscordIntegration] Nickname-Entfernung fehlgeschlagen:', error)
    })
  }

  if (mode === 'sync' && officer.status !== 'TERMINATED') {
    const nick = desiredNickname(officer)
    if (member?.nick !== nick) {
      await discordFetch<void>(`/guilds/${config.guildId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ nick }),
      }).catch((error) => {
        console.error('[DiscordIntegration] Nickname-Sync fehlgeschlagen:', error)
      })
    }
  }
}

export async function syncOfficerDiscordRoles(officerId: string, mode: 'sync' | 'remove-all' = 'sync') {
  const config = await getDiscordConfig()
  if (!config.guildId || !botToken()) return

  const officer = await getOfficerForDiscord(officerId)
  if (!officer) return

  await syncOfficerDiscordMember(officer, config, mode)
}

export async function syncFormerOfficerDiscordMember(officer: OfficerForDiscord) {
  const config = await getDiscordConfig()
  if (!config.guildId || !botToken()) return

  await syncOfficerDiscordMember(officer, config, 'remove-all')
}

export async function syncAllOfficerDiscordRoles() {
  const config = await getDiscordConfig()
  if (!config.guildId || !botToken()) return { synced: 0, skipped: 0, failed: 0, total: 0 }

  const officers = await prisma.officer.findMany({
    include: {
      rank: true,
      trainings: { include: { training: true } },
    },
    orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
  })

  let synced = 0
  let skipped = 0
  let failed = 0
  // Officers sequentiell verarbeiten (1 pro Batch) um Rate-Limits zu vermeiden
  for (const officer of officers) {
    if (!officer.discordId) {
      skipped++
      continue
    }
    try {
      await syncOfficerDiscordMember(officer, config, officer.status === 'TERMINATED' ? 'remove-all' : 'sync')
      synced++
    } catch (err) {
      failed++
      console.error(`[DiscordIntegration] Sync fehlgeschlagen für Officer ${officer.badgeNumber}:`, err)
    }
  }

  return { synced, skipped, failed, total: officers.length }
}

function bracketedServiceNumber(badgeNumber: string, prefix: string) {
  const b = badgeNumber.trim()
  const p = prefix.trim()
  if (!p) return `[${b}]`
  if (b.startsWith(p)) return `[${b}]`
  const join = p.endsWith('-') ? `${p}${b}` : `${p}-${b}`
  return `[${join}]`
}

async function postChannelEmbed(channelId: string, embed: Record<string, unknown>) {
  await discordFetch<void>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ embeds: [embed] }),
  })
}

export const DUTY_ACTIVITY_CONFIRM_PREFIX = 'lspd_duty_activity_confirm:'

async function openDmChannel(discordId: string) {
  const channel = await discordFetch<{ id: string }>(`/users/@me/channels`, {
    method: 'POST',
    body: JSON.stringify({ recipient_id: discordId }),
  })
  return channel?.id ?? null
}

async function sendDutyActivityCheckDm(officerName: string, sessionId: string, discordId: string) {
  const channelId = await openDmChannel(discordId)
  if (!channelId) return null

  const minutes = Math.round(DUTY_INACTIVITY_CONFIRM_DEADLINE_MS / 60000)
  const totalHours = DUTY_INACTIVITY_CHECK_AFTER_MS / (60 * 60 * 1000)
  const hourLabel = Number.isInteger(totalHours)
    ? `${totalHours}`
    : totalHours.toFixed(1).replace('.', ',')
  const orgName = await getOrgName()
  const deadline = new Date(Date.now() + DUTY_INACTIVITY_CONFIRM_DEADLINE_MS)

  const embed = {
    author: { name: `${orgName} · Dienst-Aktivitätsprüfung` },
    title: '🟡  Bist du noch im Dienst?',
    description: [
      `Hey **${officerName}**,`,
      '',
      `du bist seit **${hourLabel}h** ohne Aktivität im Dienst eingestempelt.`,
      `Bitte bestätige unten, dass du noch aktiv bist – sonst wirst du in **${minutes} Minuten** automatisch ausgestempelt.`,
    ].join('\n'),
    color: 0xfacc15,
    fields: [
      { name: 'Status', value: '🟢 Eingestempelt', inline: true },
      { name: 'Frist', value: discordTimestamp(deadline, 'R'), inline: true },
      { name: 'Auto-Ausstempeln', value: discordTimestamp(deadline, 't'), inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: `${orgName} HR · Dienstzeit-Überwachung` },
  }

  const payload = {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            custom_id: `${DUTY_ACTIVITY_CONFIRM_PREFIX}${sessionId}`,
            label: 'Ich bin noch aktiv',
            emoji: { name: '✅' },
          },
        ],
      },
    ],
  }

  const message = await discordFetch<{ id: string }>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return { channelId, messageId: message.id }
}

async function sendDutyAutoClockOutDm(discordId: string, officerName: string, durationMs: number) {
  try {
    const channelId = await openDmChannel(discordId)
    if (!channelId) return
    const orgName = await getOrgName()
    const embed = {
      author: { name: `${orgName} · Automatisches Dienstende` },
      title: '🔴  Automatisch ausgestempelt',
      description: [
        `**${officerName}**, du wurdest wegen ausbleibender Bestätigung automatisch ausgestempelt.`,
        '',
        'Bitte stempel dich beim nächsten Dienstantritt erneut ein.',
      ].join('\n'),
      color: 0xef4444,
      fields: [
        { name: 'Dienstdauer', value: `**${formatDuration(durationMs)}**`, inline: true },
        { name: 'Ausgestempelt', value: discordTimestamp(new Date(), 'f'), inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `${orgName} HR · Dienstzeit-Überwachung` },
    }
    await discordFetch<void>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ embeds: [embed] }),
    })
  } catch (error) {
    console.error('[DiscordIntegration] Auto-Ausstempel-DM fehlgeschlagen:', error)
  }
}

async function tryDeleteDmMessage(channelId: string | null, messageId: string | null) {
  if (!channelId || !messageId) return
  try {
    await discordFetch<void>(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' })
  } catch (error) {
    // ignore — Nachricht ggf. bereits entfernt oder DM unzugänglich
    console.warn('[DiscordIntegration] DM-Nachricht konnte nicht entfernt werden:', error)
  }
}

export async function confirmDutyActivityCheck(sessionId: string, discordId: string) {
  const session = await prisma.dutyTimeSession.findUnique({
    where: { id: sessionId },
    include: { officer: true },
  })
  if (!session) return { ok: false as const, reason: 'not-found' }
  if (session.officer.discordId !== discordId) return { ok: false as const, reason: 'forbidden' }
  if (session.clockOutAt) return { ok: false as const, reason: 'already-clocked-out' }

  await prisma.dutyTimeSession.update({
    where: { id: session.id },
    data: {
      activityConfirmedAt: new Date(),
      activityCheckSentAt: null,
      activityCheckMessageId: null,
      activityCheckChannelId: null,
    },
  })

  void tryDeleteDmMessage(session.activityCheckChannelId, session.activityCheckMessageId)
  queueDiscordDutyStatusUpdate()

  return { ok: true as const, officer: session.officer }
}

async function runDutyActivityCheckTick() {
  if (!botToken()) return

  const now = new Date()
  const sessions = await prisma.dutyTimeSession.findMany({
    where: { clockOutAt: null },
    include: { officer: { include: { rank: true } } },
  })

  for (const session of sessions) {
    const officer = session.officer
    if (!officer || !officer.discordId || officer.status === 'TERMINATED') continue

    if (session.activityCheckSentAt && !session.activityConfirmedAt) {
      const elapsed = now.getTime() - session.activityCheckSentAt.getTime()
      if (elapsed >= DUTY_INACTIVITY_CONFIRM_DEADLINE_MS) {
        try {
          const { clockOutOfficer, sessionDurationMs } = await import('./duty-times')
          const result = await clockOutOfficer(officer.id, 'discord', officer.discordId)
          await prisma.dutyTimeSession.update({
            where: { id: result.session.id },
            data: { autoClockedOut: true, clockOutSource: 'discord-auto' },
          })
          void tryDeleteDmMessage(session.activityCheckChannelId, session.activityCheckMessageId)
          await sendDutyAutoClockOutDm(officer.discordId, `${officer.firstName} ${officer.lastName}`, sessionDurationMs(result.session))
          queueDiscordDutyEvent('clock-out', result.officer, result.session, result.durationMs)
          queueDiscordDutyStatusUpdate()
        } catch (error) {
          console.error('[DiscordIntegration] Auto-Ausstempeln fehlgeschlagen:', error)
        }
      }
      continue
    }

    const heartbeat = (session.activityConfirmedAt ?? session.clockInAt).getTime()
    if (now.getTime() - heartbeat < DUTY_INACTIVITY_CHECK_AFTER_MS) continue
    if (session.activityCheckSentAt) continue

    try {
      const sent = await sendDutyActivityCheckDm(`${officer.firstName} ${officer.lastName}`, session.id, officer.discordId)
      if (!sent) continue
      await prisma.dutyTimeSession.update({
        where: { id: session.id },
        data: {
          activityCheckSentAt: new Date(),
          activityCheckMessageId: sent.messageId,
          activityCheckChannelId: sent.channelId,
        },
      })
    } catch (error) {
      console.error('[DiscordIntegration] Aktivitäts-Check DM fehlgeschlagen:', error)
    }
  }
}

export function ensureDutyActivityChecker() {
  if (dutyActivityCheckerStarted || typeof setInterval !== 'function') return
  dutyActivityCheckerStarted = true
  setInterval(() => {
    void runDutyActivityCheckTick().catch((error) => {
      console.error('[DiscordIntegration] Aktivitäts-Check fehlgeschlagen:', error)
    })
  }, DUTY_ACTIVITY_CHECK_INTERVAL_MS).unref?.()
}

async function runAbsenceExpiryTick() {
  const now = new Date()
  const stale = await prisma.officer.count({
    where: {
      status: 'AWAY',
      absenceNotices: {
        none: {
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
      },
    },
  })
  const recentlyExpired = await prisma.absenceNotice.count({
    where: {
      endsAt: {
        lt: now,
        gte: new Date(now.getTime() - ABSENCE_EXPIRY_CHECK_INTERVAL_MS - 5_000),
      },
    },
  })
  if (stale === 0 && recentlyExpired === 0) return
  await syncDiscordAbsenceStatusMessage()
}

export function ensureAbsenceExpiryChecker() {
  if (absenceExpiryCheckerStarted || typeof setInterval !== 'function') return
  absenceExpiryCheckerStarted = true
  setInterval(() => {
    void runAbsenceExpiryTick().catch((error) => {
      console.error('[DiscordIntegration] Abmeldungs-Ablaufprüfung fehlgeschlagen:', error)
    })
  }, ABSENCE_EXPIRY_CHECK_INTERVAL_MS).unref?.()
}

export function ensureDiscordSyncScheduler() {
  if (syncSchedulerStarted || typeof setInterval !== 'function') return
  syncSchedulerStarted = true

  const intervalMs = Number.parseInt(process.env.DISCORD_ROLE_SYNC_INTERVAL_MS || '300000', 10)
  const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs >= 60000 ? intervalMs : 300000
  setInterval(() => {
    void syncAllOfficerDiscordRoles().catch((error) => {
      console.error('[DiscordIntegration] Vollständiger Rollensync fehlgeschlagen:', error)
    })
  }, safeIntervalMs).unref?.()
}

export async function sendDiscordHrEvent(event: {
  type: keyof typeof EVENT_META
  title: string
  description?: string
  officer?: Pick<OfficerForDiscord, 'firstName' | 'lastName' | 'badgeNumber' | 'discordId'> & {
    rankId?: string
    hireDate?: Date
    rank?: { name: string; color?: string | null } | null
  }
  actor?: UserForDiscord
  fields?: DiscordField[]
}) {
  const config = await getDiscordConfig()
  if (!config.announcementsChannelId || !botToken()) return

  const officer = event.officer
  const meta = EVENT_META[event.type]
  const now = new Date()
  const [prefix, orgName] = await Promise.all([getBadgePrefix(), getOrgName()])

  if (event.type === 'hire' && officer) {
    const rankRoleSnow = snowflake(officer.rankId ? config.rankRoleMap[officer.rankId] : '')
    const rankValue = rankRoleSnow
      ? `<@&${rankRoleSnow}>`
      : officer.rank?.name ?? '—'
    const hireAt = officer.hireDate ?? now
    const dn = bracketedServiceNumber(officer.badgeNumber, prefix)

    const hireFields: DiscordField[] = [
      { name: 'Officer', value: mention(officer.discordId) || `**${officerName(officer)}**`, inline: true },
      { name: 'Dienstnummer', value: `\`${dn}\``, inline: true },
      { name: 'Rang', value: rankValue, inline: true },
      { name: 'Eintrittsdatum', value: discordTimestamp(hireAt, 'D'), inline: true },
      { name: 'Bearbeitet von', value: event.actor ? discordUserLabel(event.actor) : 'System', inline: true },
    ]

    await postChannelEmbed(config.announcementsChannelId, {
      author: { name: `${orgName} · ${meta.section}` },
      title: `${meta.accent}  Neueinstellung  ·  ${officerName(officer)}`,
      description: '> Wurde in den aktiven Dienst aufgenommen. Willkommen!',
      color: officer.rank?.color ? hexColorToDiscord(officer.rank.color, meta.color) : meta.color,
      fields: hireFields.slice(0, 25).map(cleanEmbedField),
      timestamp: now.toISOString(),
      footer: { text: `${orgName} HR · automatisch verarbeitet · heute um ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr` },
    })
    return
  }

  const titleName = officer ? `  ·  ${officerName(officer)}` : ''
  const title = `${meta.accent}  ${meta.label}${titleName}`

  const description = event.description
    ? `> ${truncate(event.description, 2000)}`
    : undefined

  const fields: DiscordField[] = []

  if (officer) {
    const dn = bracketedServiceNumber(officer.badgeNumber, prefix)
    const rankRoleSnow = snowflake(officer.rankId ? config.rankRoleMap[officer.rankId] : '')
    const rankValue = rankRoleSnow
      ? `<@&${rankRoleSnow}>`
      : officer.rank?.name ?? '—'

    fields.push(
      { name: 'Officer', value: mention(officer.discordId) || `**${officerName(officer)}**`, inline: true },
      { name: 'Dienstnummer', value: `\`${dn}\``, inline: true },
      { name: 'Rang', value: rankValue, inline: true },
    )
  }

  if (event.fields && event.fields.length > 0) {
    for (const f of event.fields) fields.push(f)
  }

  fields.push(
    { name: 'Bearbeitet von', value: event.actor ? discordUserLabel(event.actor) : 'System', inline: true },
    { name: 'Zeitpunkt', value: discordTimestamp(now, 'f'), inline: true },
  )

  await postChannelEmbed(config.announcementsChannelId, {
    author: { name: `${orgName} · ${meta.section}` },
    title: truncate(title, 250),
    description,
    color: officer?.rank?.color ? hexColorToDiscord(officer.rank.color, meta.color) : meta.color,
    fields: fields.slice(0, 25).map(cleanEmbedField),
    timestamp: now.toISOString(),
    footer: { text: `${orgName} HR · automatisch verarbeitet · heute um ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr` },
  })
}

function chunkLines(lines: string[], maxChars = 1024) {
  const chunks: string[] = []
  let current = ''
  for (const line of lines) {
    const candidate = current ? `${current}\n\n${line}` : line
    if (candidate.length > maxChars && current) {
      chunks.push(current)
      current = line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line
    } else {
      current = candidate.length > maxChars ? `${candidate.slice(0, maxChars - 1)}…` : candidate
    }
  }
  if (current) chunks.push(current)
  return chunks
}

const DUTY_LIST_LIMIT = 25

async function dutyStatusPayload() {
  const [snapshot, prefix, orgName] = await Promise.all([
    getDutyTimesSnapshot(),
    getBadgePrefix(),
    getOrgName(),
  ])

  const visible = snapshot.activeRows.slice(0, DUTY_LIST_LIMIT)
  const overflow = Math.max(0, snapshot.activeRows.length - visible.length)

  const fields: DiscordField[] = [
    { name: 'Im Dienst', value: `**${snapshot.activeCount}**`, inline: true },
  ]

  if (visible.length === 0) {
    fields.push({
      name: 'Eingestempelt',
      value: '*Niemand ist aktuell im Dienst.*',
      inline: false,
    })
  } else {
    const lines = visible.map((row, index) => {
      const num = String(index + 1).padStart(2, '0')
      const since = row.activeSession?.clockInAt ? discordTimestamp(row.activeSession.clockInAt, 'R') : '—'
      const current = formatDuration(row.activeSession?.currentDurationMs ?? 0)
      const dn = bracketedServiceNumber(officerBadge(row), prefix)
      const mentionStr = mention(row.discordId)
      return [
        `\`${num}\`  **${officerName(row)}**  ·  ${row.rank.name}`,
        ` \`${dn}\`  ·  ${mentionStr}`,
        ` seit ${since}  ·  **${current}**`,
      ].join('\n')
    })

    const chunks = chunkLines(lines, 1024)
    chunks.forEach((value, i) => {
      fields.push({
        name: i === 0 ? 'Eingestempelt' : ZWSP,
        value,
        inline: false,
      })
    })

    if (overflow > 0) {
      fields.push({ name: ZWSP, value: `*… und ${overflow} weitere*`, inline: false })
    }
  }

  return {
    embeds: [
      {
        author: { name: `${orgName} · Dienstzeiten` },
        title: 'Dienstzeiten',
        color: 0x3b82f6,
        fields: fields.slice(0, 25).map(cleanEmbedField),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, custom_id: 'lspd_duty_clock_in', label: 'Einstempeln', emoji: { name: '🟢' } },
          { type: 2, style: 4, custom_id: 'lspd_duty_clock_out', label: 'Ausstempeln', emoji: { name: '🔴' } },
          { type: 2, style: 2, custom_id: 'lspd_duty_refresh', label: 'Aktualisieren', emoji: { name: '🔄' } },
        ],
      },
    ],
  }
}

async function saveDutyStatusMessageId(messageId: string) {
  await prisma.systemSetting.upsert({
    where: { key: DISCORD_SETTING_KEYS.dutyStatusMessageId },
    update: { value: messageId },
    create: { key: DISCORD_SETTING_KEYS.dutyStatusMessageId, value: messageId },
  })
}

export async function syncDiscordDutyStatusMessage(options?: { forceCreate?: boolean }) {
  const config = await getDiscordConfig()
  const channelId = config.dutyStatusChannelId || config.announcementsChannelId
  if (!channelId || !botToken()) return

  const payload = await dutyStatusPayload()
  if (config.dutyStatusMessageId && !options?.forceCreate) {
    await discordFetch<void>(`/channels/${channelId}/messages/${config.dutyStatusMessageId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).catch(async () => {
      const message = await discordFetch<{ id: string }>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      await saveDutyStatusMessageId(message.id)
    })
    return
  }

  const message = await discordFetch<{ id: string }>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  await saveDutyStatusMessageId(message.id)
}

const ABSENCE_LIST_LIMIT = 25

async function absenceStatusPayload() {
  await runOfficerStatusAutomation({ force: true })
  const [absences, prefix, orgName] = await Promise.all([
    getActiveAbsenceNotices(),
    getBadgePrefix(),
    getOrgName(),
  ])
  const visible = absences.slice(0, ABSENCE_LIST_LIMIT)
  const overflow = Math.max(0, absences.length - visible.length)

  const fields: DiscordField[] = [
    { name: 'Aktiv', value: `**${absences.length}**`, inline: true },
  ]

  if (visible.length === 0) {
    fields.push({
      name: 'Abmeldungen',
      value: '*Aktuell ist niemand abgemeldet.*',
      inline: false,
    })
  } else {
    const lines = visible.map((notice, index) => {
      const num = String(index + 1).padStart(2, '0')
      const officer = notice.officer
      const reason = truncate(notice.reason.replace(/\s+/g, ' '), 180)
      const dn = bracketedServiceNumber(officerBadge(officer), prefix)
      return [
        `\`${num}\`  **${officerName(officer)}**  ·  ${officer.rank.name}`,
        ` \`${dn}\`  ·  ${mention(officer.discordId)}  ·  bis ${discordTimestamp(notice.endsAt, 'R')}`,
        ` ${reason}`,
      ].join('\n')
    })

    chunkLines(lines, 1024).forEach((value, index) => {
      fields.push({
        name: index === 0 ? 'Abmeldungen' : ZWSP,
        value,
        inline: false,
      })
    })

    if (overflow > 0) {
      fields.push({ name: ZWSP, value: `*… und ${overflow} weitere*`, inline: false })
    }
  }

  return {
    embeds: [
      {
        author: { name: `${orgName} · Abmeldungen` },
        title: 'Abmeldungen',
        color: 0x38bdf8,
        fields: fields.slice(0, 25).map(cleanEmbedField),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, custom_id: 'lspd_absence_create', label: 'Abmelden' },
          { type: 2, style: 4, custom_id: 'lspd_absence_cancel', label: 'Abmeldung beenden' },
          { type: 2, style: 2, custom_id: 'lspd_absence_refresh', label: 'Aktualisieren', emoji: { name: '🔄' } },
        ],
      },
    ],
  }
}

async function saveAbsenceStatusMessageId(messageId: string) {
  await prisma.systemSetting.upsert({
    where: { key: DISCORD_SETTING_KEYS.absenceStatusMessageId },
    update: { value: messageId },
    create: { key: DISCORD_SETTING_KEYS.absenceStatusMessageId, value: messageId },
  })
}

export async function syncDiscordAbsenceStatusMessage(options?: { forceCreate?: boolean }) {
  const config = await getDiscordConfig()
  const channelId = config.absenceStatusChannelId || config.dutyStatusChannelId || config.announcementsChannelId
  if (!channelId || !botToken()) return

  const payload = await absenceStatusPayload()
  if (config.absenceStatusMessageId && !options?.forceCreate) {
    await discordFetch<void>(`/channels/${channelId}/messages/${config.absenceStatusMessageId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).catch(async () => {
      const message = await discordFetch<{ id: string }>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      await saveAbsenceStatusMessageId(message.id)
    })
    return
  }

  const message = await discordFetch<{ id: string }>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  await saveAbsenceStatusMessageId(message.id)
}

export async function sendDiscordDutyEvent(
  action: 'clock-in' | 'clock-out',
  officer: Pick<OfficerForDiscord, 'firstName' | 'lastName' | 'badgeNumber' | 'discordId'> & { rank?: { name: string; color?: string | null } | null },
  session: { clockInAt: Date; clockOutAt: Date | null },
  durationMs?: number,
) {
  const config = await getDiscordConfig()
  const channelId = snowflake(config.dutyAdminLogChannelId) || snowflake(config.announcementsChannelId)
  if (!channelId || !botToken()) return

  const [prefix, orgName] = await Promise.all([getBadgePrefix(), getOrgName()])
  const dn = bracketedServiceNumber(officer.badgeNumber, prefix)
  const meta = EVENT_META[action === 'clock-in' ? 'dutyIn' : 'dutyOut']

  const fields: DiscordField[] = [
    { name: 'Officer', value: mention(officer.discordId) || `**${officerName(officer)}**`, inline: true },
    { name: 'Dienstnummer', value: `\`${dn}\``, inline: true },
    { name: 'Rang', value: officer.rank?.name ?? '—', inline: true },
  ]

  if (action === 'clock-in') {
    fields.push(
      { name: 'Dienstantritt', value: discordTimestamp(session.clockInAt, 'F'), inline: true },
    )
  } else {
    fields.push(
      { name: 'Beginn', value: discordTimestamp(session.clockInAt, 'f'), inline: true },
      ...(session.clockOutAt ? [{ name: 'Ende', value: discordTimestamp(session.clockOutAt, 'f'), inline: true }] : []),
      ...(durationMs !== undefined ? [{ name: 'Dauer', value: `**${formatDuration(durationMs)}**`, inline: true }] : []),
    )
  }

  await postChannelEmbed(channelId, {
    author: { name: `${orgName} · ${meta.section}` },
    title: `${meta.accent}  ${meta.label}  ·  ${officerName(officer)}`,
    color: officer.rank?.color ? hexColorToDiscord(officer.rank.color, meta.color) : meta.color,
    fields: fields.slice(0, 25).map(cleanEmbedField),
    timestamp: new Date().toISOString(),
    footer: { text: `${orgName} HR · Dienstzeit-Protokoll · heute um ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr` },
  })
}

export function queueOfficerRoleSync(officerId: string, mode: 'sync' | 'remove-all' = 'sync') {
  ensureDiscordSyncScheduler()
  void syncOfficerDiscordRoles(officerId, mode).catch((error) => {
    console.error('[DiscordIntegration] Rollensync fehlgeschlagen:', error)
    queueDiscordWebhookEvent({
      title: 'Discord-Rollensync fehlgeschlagen',
      severity: 'error',
      source: 'discord-integration',
      fields: [{ name: 'Officer-ID', value: officerId, inline: true }],
      error,
    })
  })
}

export function queueAllOfficerRoleSync() {
  ensureDiscordSyncScheduler()
  void syncAllOfficerDiscordRoles().catch((error) => {
    console.error('[DiscordIntegration] Vollständiger Rollensync fehlgeschlagen:', error)
    queueDiscordWebhookEvent({
      title: 'Discord-Rollensync fehlgeschlagen',
      description: 'Vollständiger Rollensync konnte nicht abgeschlossen werden.',
      severity: 'error',
      source: 'discord-integration',
      error,
    })
  })
}

export function queueDiscordHrEvent(event: Parameters<typeof sendDiscordHrEvent>[0]) {
  void sendDiscordHrEvent(event).catch((error) => {
    console.error('[DiscordIntegration] Event-Versand fehlgeschlagen:', error)
    queueDiscordWebhookEvent({
      title: 'Discord-HR-Meldung fehlgeschlagen',
      severity: 'error',
      source: 'discord-integration',
      fields: [{ name: 'Event', value: event.title, inline: true }],
      error,
    })
  })
}

export function queueDiscordDutyEvent(
  action: 'clock-in' | 'clock-out',
  officer: Parameters<typeof sendDiscordDutyEvent>[1],
  session: Parameters<typeof sendDiscordDutyEvent>[2],
  durationMs?: number,
) {
  void sendDiscordDutyEvent(action, officer, session, durationMs).catch((error) => {
    console.error('[DiscordIntegration] Dienstzeit-Event fehlgeschlagen:', error)
    queueDiscordWebhookEvent({
      title: 'Discord-Dienstzeitmeldung fehlgeschlagen',
      severity: 'error',
      source: 'discord-integration',
      fields: [
        { name: 'Aktion', value: action, inline: true },
        { name: 'Officer', value: officerName(officer), inline: true },
      ],
      error,
    })
  })
}

export function queueDiscordDutyStatusUpdate() {
  ensureDutyActivityChecker()
  ensureAbsenceExpiryChecker()
  void syncDiscordDutyStatusMessage().catch((error) => {
    console.error('[DiscordIntegration] Dienstzeiten-Embed fehlgeschlagen:', error)
    queueDiscordWebhookEvent({
      title: 'Discord-Dienstzeiten-Panel fehlgeschlagen',
      severity: 'error',
      source: 'discord-integration',
      error,
    })
  })
}

export function queueDiscordAbsenceStatusUpdate() {
  ensureAbsenceExpiryChecker()
  void syncDiscordAbsenceStatusMessage().catch((error) => {
    console.error('[DiscordIntegration] Abmeldungs-Embed fehlgeschlagen:', error)
    queueDiscordWebhookEvent({
      title: 'Discord-Abmeldungs-Panel fehlgeschlagen',
      severity: 'error',
      source: 'discord-integration',
      error,
    })
  })
}
