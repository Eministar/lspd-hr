import { prisma } from './prisma'
import { officerUnitKeys } from './officer-units'

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

type DiscordConfig = {
  guildId: string
  applicationId: string
  announcementsChannelId: string
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
  employeeRoleIds: 'discord.employeeRoleIds',
  commandRoleIds: 'discord.commandRoleIds',
  rankRoleMap: 'discord.rankRoleMap',
  trainingRoleMap: 'discord.trainingRoleMap',
  unitRoleMap: 'discord.unitRoleMap',
} as const

const EVENT_COLORS = {
  hire: 0x22c55e,
  promotion: 0xd4af37,
  training: 0x3b82f6,
  units: 0x06b6d4,
  termination: 0xef4444,
  update: 0x8b5cf6,
} as const

function botToken() {
  return process.env.DISCORD_BOT_TOKEN?.trim() || process.env.LSPD_DISCORD_BOT_TOKEN?.trim() || ''
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

function hexColorToDiscord(color: string | null | undefined, fallback: number) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return fallback
  return Number.parseInt(color.slice(1), 16)
}

async function discordFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = botToken()
  if (!token) throw new Error('Discord Bot-Token fehlt')

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bot ${token}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Discord API ${res.status}: ${text || res.statusText}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function getDiscordConfig(): Promise<DiscordConfig> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(DISCORD_SETTING_KEYS) } },
  })
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]))

  return {
    guildId: map[DISCORD_SETTING_KEYS.guildId] || '',
    applicationId: map[DISCORD_SETTING_KEYS.applicationId] || process.env.DISCORD_APPLICATION_ID?.trim() || '',
    announcementsChannelId: map[DISCORD_SETTING_KEYS.announcementsChannelId] || '',
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

  const roles = await discordFetch<DiscordRole[]>(`/guilds/${id}/roles`)
  return roles
    .filter((role) => !role.managed && role.name !== '@everyone')
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name))
}

export async function getDiscordGuildChannels(guildId?: string) {
  const config = await getDiscordConfig()
  const id = guildId || config.guildId
  if (!id || !botToken()) return []

  const channels = await discordFetch<DiscordChannel[]>(`/guilds/${id}/channels`)
  return channels
    .filter((channel) => channel.type === 0 || channel.type === 5 || channel.type === 15)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
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

export async function syncOfficerDiscordRoles(officerId: string, mode: 'sync' | 'remove-all' = 'sync') {
  const config = await getDiscordConfig()
  if (!config.guildId || !botToken()) return

  const officer = await getOfficerForDiscord(officerId)
  if (!officer?.discordId) return

  const memberId = snowflake(officer.discordId)
  if (!memberId) return

  const allManaged = configuredRoleIds(config)
  const desired = mode === 'remove-all' ? [] : desiredRoleIds(officer, config)
  const toAdd = desired
  const toRemove = allManaged.filter((roleId) => !desired.includes(roleId))

  await Promise.allSettled([
    ...toRemove.map((roleId) => discordFetch<void>(`/guilds/${config.guildId}/members/${memberId}/roles/${roleId}`, { method: 'DELETE' })),
    ...toAdd.map((roleId) => discordFetch<void>(`/guilds/${config.guildId}/members/${memberId}/roles/${roleId}`, { method: 'PUT' })),
  ])
}

export async function sendDiscordHrEvent(event: {
  type: keyof typeof EVENT_COLORS
  title: string
  description?: string
  officer?: Pick<OfficerForDiscord, 'firstName' | 'lastName' | 'badgeNumber' | 'discordId'> & { rank?: { name: string; color?: string | null } | null }
  actor?: UserForDiscord
  fields?: DiscordField[]
}) {
  const config = await getDiscordConfig()
  if (!config.announcementsChannelId || !botToken()) return

  const officer = event.officer
  const fields: DiscordField[] = [
    ...(officer ? [
      { name: 'Officer', value: `${officerName(officer)} (${officer.badgeNumber})`, inline: true },
      { name: 'Discord', value: mention(officer.discordId), inline: true },
      { name: 'Rang', value: officer.rank?.name || '-', inline: true },
    ] : []),
    ...(event.actor ? [{ name: 'Ausgeführt von', value: discordUserLabel(event.actor), inline: true }] : []),
    ...(event.fields ?? []),
  ]

  await discordFetch<void>(`/channels/${config.announcementsChannelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      embeds: [
        {
          title: event.title,
          description: event.description ? truncate(event.description, 4096) : undefined,
          color: officer?.rank?.color ? hexColorToDiscord(officer.rank.color, EVENT_COLORS[event.type]) : EVENT_COLORS[event.type],
          fields: fields.slice(0, 25).map((field) => ({
            name: truncate(field.name, 256),
            value: truncate(field.value || '-'),
            inline: field.inline,
          })),
          timestamp: new Date().toISOString(),
          footer: { text: 'LSPD HR System' },
        },
      ],
    }),
  })
}

export function queueOfficerRoleSync(officerId: string, mode: 'sync' | 'remove-all' = 'sync') {
  void syncOfficerDiscordRoles(officerId, mode).catch((error) => {
    console.error('[DiscordIntegration] Rollensync fehlgeschlagen:', error)
  })
}

export function queueDiscordHrEvent(event: Parameters<typeof sendDiscordHrEvent>[0]) {
  void sendDiscordHrEvent(event).catch((error) => {
    console.error('[DiscordIntegration] Event-Versand fehlgeschlagen:', error)
  })
}
