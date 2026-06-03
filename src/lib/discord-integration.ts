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

export type DiscordApiUser = {
  id: string
  username: string
  discriminator?: string
  global_name?: string | null
  avatar?: string | null
}

export type DiscordField = {
  name: string
  value: string
  inline?: boolean
}

type DiscordTrainingChange = {
  trainingId: string
  label: string
  completed: boolean
  previousCompleted?: boolean
}

type DiscordGuildMember = {
  user?: DiscordApiUser
  roles?: string[]
  nick?: string | null
  avatar?: string | null
}

type DiscordConfig = {
  guildId: string
  applicationId: string
  announcementsChannelId: string
  updateChannelId: string
  sanctionsChannelId: string
  dutyStatusChannelId: string
  dutyAdminLogChannelId: string
  dutyStatusMessageId: string
  absenceStatusChannelId: string
  absenceStatusMessageId: string
  humanResourcesRoleId: string
  employeeRoleIds: string[]
  commandRoleIds: string[]
  authLoginRoleIds: string[]
  adminRoleIds: string[]
  authGroupRoleMap: Record<string, string[]>
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
  rank?: { name: string; sortOrder: number; color?: string | null } | null
  trainings?: {
    trainingId: string
    completed: boolean
    training?: { id: string; label: string; sortOrder: number; minRank?: { sortOrder: number } | null } | null
  }[]
}

type UserForDiscord = {
  displayName: string
  discordId?: string | null
}

type DiscordHrEventInput = {
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
  trainingChanges?: DiscordTrainingChange[]
}

type DiscordUpdateAnnouncementInput = {
  title: string
  version?: string
  added?: string[]
  changed?: string[]
  removed?: string[]
  note?: string
  actor?: UserForDiscord
}

export type DiscordFullSyncProgress = {
  phase: 'starting' | 'checking' | 'syncing' | 'completed'
  total: number
  processed: number
  synced: number
  skipped: number
  failed: number
  current?: string
  message: string
  elapsedSeconds: number
  etaSeconds: number | null
}

export type DiscordHrEventMessage = {
  channelId: string
  messageId: string
}

const API_BASE = 'https://discord.com/api/v10'

export const DISCORD_SETTING_KEYS = {
  guildId: 'discord.guildId',
  applicationId: 'discord.applicationId',
  announcementsChannelId: 'discord.announcementsChannelId',
  updateChannelId: 'discord.updateChannelId',
  sanctionsChannelId: 'discord.sanctionsChannelId',
  dutyStatusChannelId: 'discord.dutyStatusChannelId',
  dutyAdminLogChannelId: 'discord.dutyAdminLogChannelId',
  dutyStatusMessageId: 'discord.dutyStatusMessageId',
  absenceStatusChannelId: 'discord.absenceStatusChannelId',
  absenceStatusMessageId: 'discord.absenceStatusMessageId',
  humanResourcesRoleId: 'discord.humanResourcesRoleId',
  employeeRoleIds: 'discord.employeeRoleIds',
  commandRoleIds: 'discord.commandRoleIds',
  authLoginRoleIds: 'discord.authLoginRoleIds',
  adminRoleIds: 'discord.adminRoleIds',
  authGroupRoleMap: 'discord.authGroupRoleMap',
  legacyAuthRoleGroupMap: 'discord.authRoleGroupMap',
  rankRoleMap: 'discord.rankRoleMap',
  trainingRoleMap: 'discord.trainingRoleMap',
  unitRoleMap: 'discord.unitRoleMap',
} as const

const EVENT_META = {
  hire:        { color: 0x22c55e, accent: '🟢', label: 'Neueinstellung',           section: 'Personalmeldung' },
  promotion:   { color: 0xd4af37, accent: '🟡', label: 'Rangänderung',              section: 'Personalmeldung' },
  training:    { color: 0x3b82f6, accent: '🔵', label: 'Ausbildung aktualisiert',   section: 'Personalmeldung' },
  units:       { color: 0x06b6d4, accent: '🔷', label: 'Unit-Zuordnung geändert',   section: 'Personalmeldung' },
  sanction:    { color: 0xf97316, accent: '🟠', label: 'Sanktion ausgestellt',      section: 'Sanktion' },
  termination: { color: 0xef4444, accent: '🔴', label: 'Dienstverhältnis beendet',  section: 'Personalmeldung' },
  update:      { color: 0x8b5cf6, accent: '🟣', label: 'Personalakte aktualisiert', section: 'Personalmeldung' },
} as const

const ZWSP = '​'

let syncSchedulerStarted = false
let absenceExpiryCheckerStarted = false

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
const memberRolesCache = new Map<string, CacheEntry<string[]>>()

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
  memberRolesCache.clear()
}

/**
 * Returns a member's Discord role IDs with a short-lived cache. On a transient
 * Discord API failure the last known (stale) roles are served instead of null,
 * so an admin is never locked out by a temporary outage.
 */
async function getDiscordMemberRoleIds(discordId: string, guildId?: string): Promise<string[] | null> {
  const gid = guildId || (await getDiscordConfig()).guildId
  const id = snowflake(discordId)
  if (!gid || !id || !botToken()) return null

  const entry = memberRolesCache.get(id)
  if (entry && Date.now() < entry.expiresAt) return entry.data

  try {
    const member = await discordFetch<DiscordGuildMember>(`/guilds/${gid}/members/${id}`)
    const roles = member.roles ?? []
    setCache(memberRolesCache, id, roles)
    return roles
  } catch (err) {
    console.error('[DiscordIntegration] Mitglieds-Rollen konnten nicht geladen werden:', err)
    // Serve stale cache during transient outages rather than dropping access.
    return entry ? entry.data : null
  }
}

/**
 * Determines admin status LIVE from the user's actual Discord roles (cached).
 * Independent of the dashboard group mapping, so it cannot be broken by group
 * misconfiguration and is never persisted (the periodic sync cannot strip it).
 */
export async function isDiscordUserAdmin(discordId: string | null | undefined): Promise<boolean> {
  const id = snowflake(discordId)
  if (!id) return false
  const config = await getDiscordConfig()
  if (config.adminRoleIds.length === 0) return false
  const roles = await getDiscordMemberRoleIds(id, config.guildId)
  if (!roles) return false
  const roleSet = new Set(roles)
  return config.adminRoleIds.some((roleId) => roleSet.has(roleId))
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

export async function canCheckDiscordGuildMembers(guildId?: string) {
  const config = await getDiscordConfig()
  const id = guildId || config.guildId
  return !!id && !!botToken()
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

function envSanctionsChannelId() {
  return (
    process.env.DISCORD_SANCTIONS_CHANNEL_ID?.trim() ||
    process.env.LSPD_DISCORD_SANCTIONS_CHANNEL_ID?.trim() ||
    ''
  )
}

function envUpdateChannelId() {
  return (
    process.env.DISCORD_UPDATE_CHANNEL_ID?.trim() ||
    process.env.LSPD_DISCORD_UPDATE_CHANNEL_ID?.trim() ||
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

function envHumanResourcesRoleId() {
  return (
    process.env.DISCORD_HUMAN_RESOURCES_ROLE_ID?.trim() ||
    process.env.LSPD_DISCORD_HUMAN_RESOURCES_ROLE_ID?.trim() ||
    ''
  )
}

function envAuthLoginRoleIds(): string[] {
  const raw =
    process.env.DISCORD_AUTH_LOGIN_ROLE_IDS?.trim() ||
    process.env.LSPD_DISCORD_AUTH_LOGIN_ROLE_IDS?.trim() ||
    ''
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []
}

function envAdminRoleIds(): string[] {
  const raw =
    process.env.DISCORD_ADMIN_ROLE_IDS?.trim() ||
    process.env.LSPD_DISCORD_ADMIN_ROLE_IDS?.trim() ||
    ''
  const explicit = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []
  if (explicit.length > 0) return explicit
  // Legacy fallback: the removed bootstrap logic used DISCORD_AUTH_LOGIN_ROLE_IDS
  // as the admin/bootstrap roles, so honour it when no explicit admin roles exist.
  return envAuthLoginRoleIds()
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

function cleanGroupRoleMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([groupId, roleIds]) => {
        const cleanGroupId = typeof groupId === 'string' ? groupId.trim() : ''
        if (!cleanGroupId) return null

        const rawRoleIds = Array.isArray(roleIds) ? roleIds : [roleIds]
        const cleanRoleIds = Array.from(new Set(
          rawRoleIds.filter((roleId): roleId is string => (
            typeof roleId === 'string' && /^\d{17,22}$/.test(roleId)
          )),
        ))
        return cleanRoleIds.length > 0 ? [cleanGroupId, cleanRoleIds] as const : null
      })
      .filter((entry): entry is readonly [string, string[]] => Boolean(entry)),
  )
}

function cleanLegacyRoleGroupMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => (
        typeof entry[0] === 'string' &&
        /^\d{17,22}$/.test(entry[0]) &&
        typeof entry[1] === 'string' &&
        entry[1].trim().length > 0
      ))
      .map(([roleId, groupId]) => [roleId, groupId.trim()]),
  )
}

function normalizeAuthGroupRoleMap(primary: unknown, legacy: unknown): Record<string, string[]> {
  const groupRoleMap = cleanGroupRoleMap(primary)
  if (Object.keys(groupRoleMap).length > 0) return groupRoleMap

  const legacyRoleGroupMap = cleanLegacyRoleGroupMap(legacy)
  if (Object.keys(legacyRoleGroupMap).length > 0) {
    const grouped = new Map<string, string[]>()
    for (const [roleId, groupId] of Object.entries(legacyRoleGroupMap)) {
      grouped.set(groupId, [...(grouped.get(groupId) ?? []), roleId])
    }
    return Object.fromEntries(grouped)
  }
  return {}
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
    updateChannelId: map[DISCORD_SETTING_KEYS.updateChannelId] || envUpdateChannelId(),
    sanctionsChannelId: map[DISCORD_SETTING_KEYS.sanctionsChannelId] || envSanctionsChannelId(),
    dutyStatusChannelId: map[DISCORD_SETTING_KEYS.dutyStatusChannelId] || envDutyStatusChannelId(),
    dutyAdminLogChannelId: map[DISCORD_SETTING_KEYS.dutyAdminLogChannelId] || envDutyAdminLogChannelId(),
    dutyStatusMessageId: map[DISCORD_SETTING_KEYS.dutyStatusMessageId] || '',
    absenceStatusChannelId: map[DISCORD_SETTING_KEYS.absenceStatusChannelId] || envAbsenceStatusChannelId(),
    absenceStatusMessageId: map[DISCORD_SETTING_KEYS.absenceStatusMessageId] || '',
    humanResourcesRoleId: map[DISCORD_SETTING_KEYS.humanResourcesRoleId] || envHumanResourcesRoleId(),
    employeeRoleIds: cleanRoleIds(parseJson(map[DISCORD_SETTING_KEYS.employeeRoleIds], [])),
    commandRoleIds: cleanRoleIds(parseJson(map[DISCORD_SETTING_KEYS.commandRoleIds], [])),
    authLoginRoleIds: cleanRoleIds(parseJson(map[DISCORD_SETTING_KEYS.authLoginRoleIds], envAuthLoginRoleIds())),
    adminRoleIds: cleanRoleIds(parseJson(map[DISCORD_SETTING_KEYS.adminRoleIds], envAdminRoleIds())),
    authGroupRoleMap: normalizeAuthGroupRoleMap(
      parseJson(map[DISCORD_SETTING_KEYS.authGroupRoleMap], {}),
      parseJson(map[DISCORD_SETTING_KEYS.legacyAuthRoleGroupMap], {}),
    ),
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
  if (input.updateChannelId !== undefined) data[DISCORD_SETTING_KEYS.updateChannelId] = input.updateChannelId.trim()
  if (input.sanctionsChannelId !== undefined) data[DISCORD_SETTING_KEYS.sanctionsChannelId] = input.sanctionsChannelId.trim()
  if (input.dutyStatusChannelId !== undefined) data[DISCORD_SETTING_KEYS.dutyStatusChannelId] = input.dutyStatusChannelId.trim()
  if (input.dutyAdminLogChannelId !== undefined) data[DISCORD_SETTING_KEYS.dutyAdminLogChannelId] = input.dutyAdminLogChannelId.trim()
  if (input.dutyStatusMessageId !== undefined) data[DISCORD_SETTING_KEYS.dutyStatusMessageId] = input.dutyStatusMessageId.trim()
  if (input.absenceStatusChannelId !== undefined) data[DISCORD_SETTING_KEYS.absenceStatusChannelId] = input.absenceStatusChannelId.trim()
  if (input.absenceStatusMessageId !== undefined) data[DISCORD_SETTING_KEYS.absenceStatusMessageId] = input.absenceStatusMessageId.trim()
  if (input.humanResourcesRoleId !== undefined) data[DISCORD_SETTING_KEYS.humanResourcesRoleId] = input.humanResourcesRoleId.trim()
  if (input.employeeRoleIds !== undefined) data[DISCORD_SETTING_KEYS.employeeRoleIds] = JSON.stringify(cleanRoleIds(input.employeeRoleIds))
  if (input.commandRoleIds !== undefined) data[DISCORD_SETTING_KEYS.commandRoleIds] = JSON.stringify(cleanRoleIds(input.commandRoleIds))
  if (input.authLoginRoleIds !== undefined) data[DISCORD_SETTING_KEYS.authLoginRoleIds] = JSON.stringify(cleanRoleIds(input.authLoginRoleIds))
  if (input.adminRoleIds !== undefined) data[DISCORD_SETTING_KEYS.adminRoleIds] = JSON.stringify(cleanRoleIds(input.adminRoleIds))
  if (input.authGroupRoleMap !== undefined) data[DISCORD_SETTING_KEYS.authGroupRoleMap] = JSON.stringify(cleanGroupRoleMap(input.authGroupRoleMap))
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

export async function getDiscordGuildMember(discordId: string, guildId?: string) {
  const config = await getDiscordConfig()
  const id = guildId || config.guildId
  const memberId = snowflake(discordId)
  if (!id || !memberId || !botToken()) return null

  return discordFetch<DiscordGuildMember>(`/guilds/${id}/members/${memberId}`).catch(() => null)
}

export async function getDiscordGuildMembers(guildId?: string) {
  const config = await getDiscordConfig()
  const id = guildId || config.guildId
  if (!id || !botToken()) return []

  const members: DiscordGuildMember[] = []
  let after = '0'

  while (true) {
    const page = await discordFetch<DiscordGuildMember[]>(`/guilds/${id}/members?limit=1000&after=${after}`).catch(() => [])
    if (page.length === 0) break
    members.push(...page)
    const lastId = page[page.length - 1]?.user?.id
    if (!lastId || page.length < 1000) break
    after = lastId
  }

  return members
}

async function getOfficerForDiscord(officerId: string) {
  return prisma.officer.findUnique({
    where: { id: officerId },
    include: {
      rank: true,
      trainings: { include: { training: { include: { minRank: true } } } },
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

function dashboardGroupIdsForRoles(roleIds: string[], config: DiscordConfig) {
  const roles = new Set(roleIds)
  return Array.from(new Set(
    Object.entries(config.authGroupRoleMap)
      .filter(([, groupRoleIds]) => groupRoleIds.some((roleId) => roles.has(roleId)))
      .map(([groupId]) => groupId)
      .filter(Boolean),
  ))
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

async function fetchGuildMember(
  config: DiscordConfig,
  discordId: string | null | undefined,
): Promise<DiscordGuildMember | null> {
  const memberId = snowflake(discordId)
  if (!config.guildId || !memberId || !botToken()) return null
  return discordFetch<DiscordGuildMember>(`/guilds/${config.guildId}/members/${memberId}`).catch(() => null)
}

async function syncOfficerDashboardGroupsForOfficer(
  officer: OfficerForDiscord,
  config: DiscordConfig,
  mode: 'sync' | 'remove-all' = 'sync',
  memberRoles?: string[] | null,
) {
  if (!officer?.discordId) return

  const user = await prisma.user.findFirst({
    where: { discordId: officer.discordId },
    select: {
      id: true,
      groupMemberships: { select: { groupId: true, source: true } },
    },
  })
  if (!user) return

  // Robustness: Discord-derived dashboard groups (incl. admin/login roles) MUST be
  // computed from the member's ACTUAL Discord roles — exactly like the login flow
  // (matchingGroupIds). Deriving them from the officer's rank/unit/training roles
  // alone silently strips any group mapped to a non-rank role (e.g. an "Admin"
  // role) on every periodic sync, so the user loses permissions over time.
  let desiredDiscordGroupIds: string[]
  if (mode === 'remove-all') {
    desiredDiscordGroupIds = []
  } else {
    if (!memberRoles) {
      // Actual Discord roles are unknown (no bot token or fetch failed). Do NOT
      // touch Discord-sourced memberships — preserving them avoids revoking
      // permissions on transient Discord API failures.
      return
    }
    // Union of the member's real Discord roles and the officer's intended roles,
    // so the dashboard reflects both auth roles (admin) and rank-based grants.
    const effectiveRoles = Array.from(new Set([...memberRoles, ...desiredRoleIds(officer, config)]))
    desiredDiscordGroupIds = dashboardGroupIdsForRoles(effectiveRoles, config)
  }

  // Keep manual memberships, only replace Discord-sourced ones
  const manualGroupIds = user.groupMemberships
    .filter((m) => m.source === 'manual')
    .map((m) => m.groupId)

  const allGroupIds = Array.from(new Set([...manualGroupIds, ...desiredDiscordGroupIds]))
  const existingGroups = allGroupIds.length > 0
    ? await prisma.userGroup.findMany({ where: { id: { in: allGroupIds } }, select: { id: true } })
    : []
  const existingGroupIds = new Set(existingGroups.map((group) => group.id))
  const validDiscordGroupIds = desiredDiscordGroupIds.filter((id) => existingGroupIds.has(id))
  const validManualGroupIds = manualGroupIds.filter((id) => existingGroupIds.has(id))
  const primaryGroupId = validManualGroupIds[0] ?? validDiscordGroupIds[0] ?? null

  await prisma.$transaction([
    // Only replace Discord-synced memberships, never touch manual assignments
    prisma.userGroupMembership.deleteMany({ where: { userId: user.id, source: 'discord' } }),
    ...(validDiscordGroupIds.length > 0
      ? [prisma.userGroupMembership.createMany({
          data: validDiscordGroupIds.map((groupId) => ({ userId: user.id, groupId, source: 'discord' })),
          skipDuplicates: true,
        })]
      : []),
    // Update primary group only — NEVER clear direct permissions here
    prisma.user.update({
      where: { id: user.id },
      data: { groupId: primaryGroupId },
    }),
  ])
}

export async function syncOfficerDashboardGroups(officerId: string, mode: 'sync' | 'remove-all' = 'sync') {
  const config = await getDiscordConfig()
  const officer = await getOfficerForDiscord(officerId)
  if (!officer) return

  const member = mode === 'remove-all' ? null : await fetchGuildMember(config, officer.discordId)
  await syncOfficerDashboardGroupsForOfficer(officer, config, mode, member?.roles ?? null)
}

async function syncOfficerDiscordMember(
  officer: OfficerForDiscord,
  config: DiscordConfig,
  mode: 'sync' | 'remove-all' = 'sync',
  preloadedMember?: DiscordGuildMember | null,
) {
  if (!officer?.discordId) return

  const memberId = snowflake(officer.discordId)
  if (!memberId) return

  const allManaged = configuredRoleIds(config)
  const desired = mode === 'remove-all' ? [] : desiredRoleIds(officer, config)
  // Reuse a member already fetched by the caller (undefined = not provided → fetch)
  const member = preloadedMember !== undefined
    ? preloadedMember
    : await discordFetch<DiscordGuildMember>(`/guilds/${config.guildId}/members/${memberId}`).catch(() => null)
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

export async function addDiscordRoleToMember(discordId: string, roleId: string) {
  const config = await getDiscordConfig()
  if (!config.guildId || !botToken()) return
  const memberId = snowflake(discordId)
  const rId = snowflake(roleId)
  if (!memberId || !rId) return
  await discordFetch<void>(`/guilds/${config.guildId}/members/${memberId}/roles/${rId}`, { method: 'PUT' }).catch((err) => {
    console.error('[DiscordIntegration] Rolle hinzufügen fehlgeschlagen:', err)
  })
}

export async function removeDiscordRoleFromMember(discordId: string, roleId: string) {
  const config = await getDiscordConfig()
  if (!config.guildId || !botToken()) return
  const memberId = snowflake(discordId)
  const rId = snowflake(roleId)
  if (!memberId || !rId) return
  await discordFetch<void>(`/guilds/${config.guildId}/members/${memberId}/roles/${rId}`, { method: 'DELETE' }).catch((err) => {
    console.error('[DiscordIntegration] Rolle entfernen fehlgeschlagen:', err)
  })
}

export async function syncOfficerDiscordRoles(officerId: string, mode: 'sync' | 'remove-all' = 'sync') {
  const config = await getDiscordConfig()
  const officer = await getOfficerForDiscord(officerId)
  if (!officer) return

  // Fetch the member once and share it between group- and role-sync to avoid
  // double Discord calls and to derive dashboard groups from actual roles.
  const member = mode === 'remove-all' ? null : await fetchGuildMember(config, officer.discordId)

  await syncOfficerDashboardGroupsForOfficer(officer, config, mode, member?.roles ?? null)

  if (!config.guildId || !botToken()) return

  await syncOfficerDiscordMember(officer, config, mode, mode === 'remove-all' ? undefined : member)
}

export async function syncFormerOfficerDiscordMember(officer: OfficerForDiscord) {
  const config = await getDiscordConfig()
  await syncOfficerDashboardGroupsForOfficer(officer, config, 'remove-all')

  if (!config.guildId || !botToken()) return

  await syncOfficerDiscordMember(officer, config, 'remove-all')
}

export async function syncAllOfficerDiscordRoles(options?: {
  onProgress?: (progress: DiscordFullSyncProgress) => void | Promise<void>
}) {
  const config = await getDiscordConfig()

  const officers = await prisma.officer.findMany({
    include: {
      rank: true,
      trainings: { include: { training: { include: { minRank: true } } } },
    },
    orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
  })

  let synced = 0
  let skipped = 0
  let failed = 0
  const canSyncDiscord = !!config.guildId && !!botToken()
  const startedAt = Date.now()

  const emitProgress = async (
    phase: DiscordFullSyncProgress['phase'],
    current?: string,
    message?: string,
  ) => {
    const processed = synced + skipped + failed
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
    const etaSeconds = processed > 0 && processed < officers.length
      ? Math.max(0, Math.round((elapsedSeconds / processed) * (officers.length - processed)))
      : null

    await options?.onProgress?.({
      phase,
      total: officers.length,
      processed,
      synced,
      skipped,
      failed,
      current,
      message: message ?? 'Synchronisiere Officers',
      elapsedSeconds,
      etaSeconds,
    })
  }

  await emitProgress('starting', undefined, 'Lade Officers und Discord-Konfiguration')

  // Officers sequentiell verarbeiten (1 pro Batch) um Rate-Limits zu vermeiden
  for (const officer of officers) {
    const officerLabel = `${officer.firstName} ${officer.lastName} #${officer.badgeNumber}`
    await emitProgress('checking', officerLabel, `Prüfe ${officerLabel}`)

    if (!officer.discordId) {
      skipped++
      await emitProgress('syncing', officerLabel, `Übersprungen: ${officerLabel} hat keine Discord-ID`)
      continue
    }
    try {
      const mode = officer.status === 'TERMINATED' ? 'remove-all' : 'sync'
      await emitProgress('syncing', officerLabel, `Synchronisiere Gruppen und Rollen für ${officerLabel}`)

      // Fetch the member once per officer; reuse for both group and role sync.
      const member = canSyncDiscord && mode === 'sync'
        ? await fetchGuildMember(config, officer.discordId)
        : null

      await syncOfficerDashboardGroupsForOfficer(officer, config, mode, member?.roles ?? null)
      if (canSyncDiscord) {
        await syncOfficerDiscordMember(officer, config, mode, mode === 'remove-all' ? undefined : member)
      }
      synced++
      await emitProgress('syncing', officerLabel, `Fertig: ${officerLabel}`)
    } catch (err) {
      failed++
      console.error(`[DiscordIntegration] Sync fehlgeschlagen für Officer ${officer.badgeNumber}:`, err)
      await emitProgress('syncing', officerLabel, `Fehlgeschlagen: ${officerLabel}`)
    }
  }

  await emitProgress('completed', undefined, 'Full-Sync abgeschlossen')

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
  return discordFetch<{ id: string }>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ embeds: [embed] }),
  })
}

async function patchChannelEmbed(channelId: string, messageId: string, embed: Record<string, unknown>) {
  await discordFetch<void>(`/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ embeds: [embed] }),
  })
}

async function postChannelMessage(channelId: string, payload: Record<string, unknown>) {
  return discordFetch<{ id: string }>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

function cleanUpdateLines(lines: string[] | undefined) {
  return (lines ?? [])
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function updateDiffField(name: string, prefix: '+' | '!' | '-', lines: string[]): DiscordField | null {
  const cleaned = cleanUpdateLines(lines)
  if (cleaned.length === 0) return null
  const value = cleaned.map((line) => `${prefix} ${line}`).join('\n')
  const maxContentLength = 1024 - '```diff\n\n```'.length
  const content = truncate(value, maxContentLength)
  return {
    name,
    value: `\`\`\`diff\n${content}\n\`\`\``,
    inline: false,
  }
}

export async function sendDiscordUpdateAnnouncement(input: DiscordUpdateAnnouncementInput) {
  const config = await getDiscordConfig()
  const channelId = config.updateChannelId || config.announcementsChannelId
  if (!channelId) throw new Error('Update-Channel ist nicht konfiguriert')
  if (!botToken()) throw new Error('Discord Bot-Token fehlt')

  const title = input.title.trim()
  if (!title) throw new Error('Titel ist erforderlich')

  const fields = [
    updateDiffField('✨ Neu', '+', input.added ?? []),
    updateDiffField('🔧 Geändert', '!', input.changed ?? []),
    updateDiffField('🗑️ Entfernt', '-', input.removed ?? []),
  ].filter((field): field is DiscordField => Boolean(field))

  if (fields.length === 0) {
    throw new Error('Mindestens ein Changelog-Eintrag ist erforderlich')
  }

  const orgName = await getOrgName()
  const now = new Date()
  const version = input.version?.trim()
  const note = input.note?.trim()
  const actorLabel = input.actor ? discordUserLabel(input.actor) : 'System'
  const description = [
    version ? `> \`v${version.replace(/^v/i, '')}\`` : null,
    note ? note.split('\n').map((line) => `> ${line}`).join('\n') : null,
  ].filter(Boolean).join('\n')

  return postChannelMessage(channelId, {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        author: { name: `${orgName} · Update` },
        title: `📢 ${truncate(title, 240)}`,
        description: description ? truncate(description, 2000) : undefined,
        color: 0xd4af37,
        fields: [
          ...fields,
          { name: 'Gesendet von', value: actorLabel, inline: true },
          { name: 'Zeitpunkt', value: discordTimestamp(now, 'f'), inline: true },
        ].slice(0, 25).map(cleanEmbedField),
        timestamp: now.toISOString(),
        footer: { text: `${orgName} HR · Changelog` },
      },
    ],
  })
}

async function runAbsenceExpiryTick() {
  const now = new Date()
  const stale = await prisma.officer.count({
    where: {
      status: 'AWAY',
      absenceNotices: {
        none: { startsAt: { lte: now }, endsAt: { gte: now } },
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

function hrEventChannelId(config: DiscordConfig, type: keyof typeof EVENT_META) {
  if (type === 'sanction') return config.sanctionsChannelId || config.announcementsChannelId
  return config.announcementsChannelId
}

function cleanEmbedField(field: DiscordField): DiscordField {
  return {
    name: truncate(field.name || ZWSP, 256),
    value: truncate(field.value || '—', 1024),
    inline: field.inline,
  }
}

function trainingRoleValue(config: DiscordConfig, change: DiscordTrainingChange) {
  const roleId = snowflake(config.trainingRoleMap[change.trainingId])
  return roleId ? `<@&${roleId}>` : change.label
}

function trainingStatusLabel(completed: boolean) {
  return completed ? '✅' : '❌'
}

function trainingChangeField(change: DiscordTrainingChange, config: DiscordConfig): DiscordField {
  return {
    name: ZWSP,
    value: [
      trainingRoleValue(config, change),
      `${trainingStatusLabel(change.previousCompleted ?? false)} → ${trainingStatusLabel(change.completed)}`,
    ].join('\n'),
    inline: true,
  }
}

async function buildDiscordHrEventEmbed(event: DiscordHrEventInput, config: DiscordConfig) {
  const officer = event.officer
  const meta = EVENT_META[event.type]
  const now = new Date()
  const [prefix, orgName] = await Promise.all([getBadgePrefix(), getOrgName()])
  const color = officer?.rank?.color ? hexColorToDiscord(officer.rank.color, meta.color) : meta.color
  const actorLabel = event.actor ? discordUserLabel(event.actor) : 'System'
  const footerText = `${orgName} HR · ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr`

  if (event.type === 'hire' && officer) {
    const rankRoleSnow = snowflake(officer.rankId ? config.rankRoleMap[officer.rankId] : '')
    const rankValue = rankRoleSnow ? `<@&${rankRoleSnow}>` : officer.rank?.name ?? '—'
    const hireAt = officer.hireDate ?? now
    const dn = bracketedServiceNumber(officer.badgeNumber, prefix)
    return {
      author: { name: `${orgName} · Personalmeldung` },
      title: `Neueinstellung · ${officerName(officer)}`,
      description: `> Willkommen bei der ${orgName}, **${officerName(officer)}**!`,
      color,
      fields: [
        { name: 'Officer', value: mention(officer.discordId) || `**${officerName(officer)}**`, inline: true },
        { name: 'Dienstnummer', value: `\`${dn}\``, inline: true },
        { name: 'Rang', value: rankValue, inline: true },
        { name: 'Eintrittsdatum', value: discordTimestamp(hireAt, 'D'), inline: true },
        { name: 'Bearbeitet von', value: actorLabel, inline: true },
      ].map(cleanEmbedField),
      timestamp: now.toISOString(),
      footer: { text: footerText },
    }
  }

  if (event.type === 'sanction') {
    const fields: DiscordField[] = []
    if (officer) {
      const dn = bracketedServiceNumber(officer.badgeNumber, prefix)
      fields.push({ name: 'Officer', value: mention(officer.discordId), inline: true })
      fields.push({ name: 'Dienstnummer', value: `\`${dn}\``, inline: true })
    }
    for (const f of event.fields ?? []) fields.push(f)
    fields.push({ name: 'Ausgestellt von', value: actorLabel, inline: true })
    return {
      author: { name: `${orgName} · Sanktion` },
      title: meta.label,
      color,
      fields: fields.slice(0, 25).map(cleanEmbedField),
      timestamp: now.toISOString(),
      footer: { text: footerText },
    }
  }

  const titleName = officer ? ` · ${officerName(officer)}` : ''
  const fields: DiscordField[] = []

  if (officer) {
    const dn = bracketedServiceNumber(officer.badgeNumber, prefix)
    const rankRoleSnow = snowflake(officer.rankId ? config.rankRoleMap[officer.rankId] : '')
    const rankValue = rankRoleSnow ? `<@&${rankRoleSnow}>` : officer.rank?.name ?? '—'
    fields.push({ name: 'Officer', value: mention(officer.discordId) || `**${officerName(officer)}**`, inline: true })
    fields.push({ name: 'Dienstnummer', value: `\`${dn}\``, inline: true })
    fields.push({ name: 'Rang', value: rankValue, inline: true })
  }

  if (event.type === 'training' && event.trainingChanges?.length) {
    for (const change of event.trainingChanges) {
      fields.push(trainingChangeField(change, config))
    }
  } else {
    for (const f of event.fields ?? []) fields.push(f)
  }
  fields.push({ name: 'Bearbeitet von', value: actorLabel, inline: true })
  fields.push({ name: 'Zeitpunkt', value: discordTimestamp(now, 'f'), inline: true })

  const descriptionText = event.description
    ? event.description.split('\n').map(l => `> ${l}`).join('\n')
    : undefined

  return {
    author: { name: `${orgName} · ${meta.section}` },
    title: `${meta.label}${titleName}`,
    description: descriptionText ? truncate(descriptionText, 2000) : undefined,
    color,
    fields: fields.slice(0, 25).map(cleanEmbedField),
    timestamp: now.toISOString(),
    footer: { text: footerText },
  }
}

export async function sendDiscordHrEvent(event: DiscordHrEventInput): Promise<DiscordHrEventMessage | null> {
  const config = await getDiscordConfig()
  const channelId = hrEventChannelId(config, event.type)
  if (!channelId || !botToken()) return null

  const embed = await buildDiscordHrEventEmbed(event, config)
  const message = await postChannelEmbed(channelId, embed)
  return { channelId, messageId: message.id }
}

export async function editDiscordHrEventMessage(
  channelId: string | null | undefined,
  messageId: string | null | undefined,
  event: DiscordHrEventInput,
) {
  if (!channelId || !messageId || !botToken()) return
  const config = await getDiscordConfig()
  const embed = await buildDiscordHrEventEmbed(event, config)
  await patchChannelEmbed(channelId, messageId, embed)
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
    { name: 'Spielzeit Woche', value: `**${formatDuration(snapshot.totalWeekDurationMs)}**`, inline: true },
  ]

  if (visible.length === 0) {
    fields.push({ name: 'Aktive Police-Spieler', value: '*Niemand ist aktuell als Police online.*', inline: false })
  } else {
    const lines = visible.map((row, index) => {
      const num = String(index + 1).padStart(2, '0')
      const active = row.activePlaySession
      const player = row.currentPlayer
      const since = active?.startedAt ? discordTimestamp(active.startedAt, 'R') : '—'
      const current = formatDuration(active?.currentDurationMs ?? 0)
      const dn = bracketedServiceNumber(officerBadge(row), prefix)
      const ping = player?.ping !== null && player?.ping !== undefined ? `  \`${player.ping}ms\`` : ''
      return [
        `\`${num}\`  **${officerName(row)}**  ·  ${row.rank.name}  ·  **${current}**${ping}`,
        `> \`${dn}\`  ·  ${mention(row.discordId)}  ·  seit ${since}`,
      ].join('\n')
    })
    const chunks = chunkLines(lines, 1024)
    chunks.forEach((value, i) => {
      fields.push({ name: i === 0 ? 'Aktive Police-Spieler' : ZWSP, value, inline: false })
    })
    if (overflow > 0) fields.push({ name: ZWSP, value: `*… und ${overflow} weitere*`, inline: false })
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
    components: [],
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
      const message = await postChannelMessage(channelId, payload)
      await saveDutyStatusMessageId(message.id)
    })
    return
  }

  const message = await postChannelMessage(channelId, payload)
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
    fields.push({ name: 'Abmeldungen', value: '*Aktuell ist niemand abgemeldet.*', inline: false })
  } else {
    const lines = visible.map((notice, index) => {
      const num = String(index + 1).padStart(2, '0')
      const officer = notice.officer
      const reason = truncate(notice.reason.replace(/\s+/g, ' '), 180)
      const dn = bracketedServiceNumber(officerBadge(officer), prefix)
      return [
        `\`${num}\`  **${officerName(officer)}**  ·  ${officer.rank.name}`,
        `> \`${dn}\`  ·  ${mention(officer.discordId)}  ·  bis ${discordTimestamp(notice.endsAt, 'R')}`,
        `> *${reason}*`,
      ].join('\n')
    })
    chunkLines(lines, 1024).forEach((value, index) => {
      fields.push({ name: index === 0 ? 'Abmeldungen' : ZWSP, value, inline: false })
    })
    if (overflow > 0) fields.push({ name: ZWSP, value: `*… und ${overflow} weitere*`, inline: false })
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
          { type: 2, style: 2, custom_id: 'lspd_absence_refresh', label: 'Aktualisieren' },
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
      const message = await postChannelMessage(channelId, payload)
      await saveAbsenceStatusMessageId(message.id)
    })
    return
  }

  const message = await postChannelMessage(channelId, payload)
  await saveAbsenceStatusMessageId(message.id)
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

export function queueDiscordDutyStatusUpdate() {
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
