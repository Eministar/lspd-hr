import { prisma } from './prisma'
import { officerUnitKeys } from './officer-units'
import { formatDuration, getDutyTimesSnapshot } from './duty-times'

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
  dutyStatusMessageId: string
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
  dutyStatusMessageId: 'discord.dutyStatusMessageId',
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
  dutyIn: 0x22c55e,
  dutyOut: 0xef4444,
} as const

const EVENT_EMOJIS: Record<keyof typeof EVENT_COLORS, string> = {
  hire: '✅',
  promotion: '📈',
  training: '🎓',
  units: '🚓',
  termination: '🚨',
  update: '✨',
  dutyIn: '🟢',
  dutyOut: '🔴',
}

let syncSchedulerStarted = false

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

function formatDiscordDate(date = new Date()) {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(date)
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
    guildId: map[DISCORD_SETTING_KEYS.guildId] || envGuildId(),
    applicationId: map[DISCORD_SETTING_KEYS.applicationId] || envApplicationId(),
    announcementsChannelId: map[DISCORD_SETTING_KEYS.announcementsChannelId] || envAnnouncementsChannelId(),
    dutyStatusChannelId: map[DISCORD_SETTING_KEYS.dutyStatusChannelId] || envDutyStatusChannelId(),
    dutyStatusMessageId: map[DISCORD_SETTING_KEYS.dutyStatusMessageId] || '',
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
  if (input.dutyStatusMessageId !== undefined) data[DISCORD_SETTING_KEYS.dutyStatusMessageId] = input.dutyStatusMessageId.trim()
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
  const seenIds = new Set<string>()

  return roles
    .filter((role) => !role.managed && role.name !== '@everyone')
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name))
    .filter((role) => {
      if (seenIds.has(role.id)) return false
      seenIds.add(role.id)
      return true
    })
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

  const roleResults = await Promise.allSettled([
    ...toRemove.map((roleId) => discordFetch<void>(`/guilds/${config.guildId}/members/${memberId}/roles/${roleId}`, { method: 'DELETE' })),
    ...toAdd.map((roleId) => discordFetch<void>(`/guilds/${config.guildId}/members/${memberId}/roles/${roleId}`, { method: 'PUT' })),
  ])

  for (const result of roleResults) {
    if (result.status === 'rejected') console.error('[DiscordIntegration] Rollenaktion fehlgeschlagen:', result.reason)
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
  if (!config.guildId || !botToken()) return { synced: 0 }

  const officers = await prisma.officer.findMany({
    include: {
      rank: true,
      trainings: { include: { training: true } },
    },
    orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
  })

  let synced = 0
  for (let i = 0; i < officers.length; i += 5) {
    const batch = officers.slice(i, i + 5)
    await Promise.allSettled(batch.map(async (officer) => {
      await syncOfficerDiscordMember(officer, config, officer.status === 'TERMINATED' ? 'remove-all' : 'sync')
      synced++
    }))
  }

  return { synced }
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
  const now = new Date()
  const emoji = EVENT_EMOJIS[event.type]
  const title = event.title.startsWith(emoji) ? event.title : `${emoji} ${event.title}`
  const fields: DiscordField[] = [
    ...(officer ? [
      { name: '👮 Officer', value: `**${officerName(officer)}**`, inline: true },
      { name: '🪪 Dienstnummer', value: officerBadge(officer), inline: true },
      { name: '🎖️ Rang', value: officer.rank?.name || '-', inline: true },
      { name: '💬 Discord', value: mention(officer.discordId), inline: true },
      { name: '🏷️ Name auf Discord', value: desiredNickname(officer), inline: true },
    ] : []),
    ...(event.actor ? [{ name: '🧑‍💼 Bearbeitet von', value: discordUserLabel(event.actor), inline: true }] : []),
    { name: '🕒 Zeitpunkt', value: formatDiscordDate(now), inline: true },
    ...(event.fields ?? []),
  ]
  const description = event.description ?? (
    event.type === 'hire' && officer
      ? `Willkommen im LSPD, **${officerName(officer)}**.`
      : undefined
  )

  await discordFetch<void>(`/channels/${config.announcementsChannelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      embeds: [
        {
          title,
          description: description ? truncate(description, 4096) : undefined,
          color: officer?.rank?.color ? hexColorToDiscord(officer.rank.color, EVENT_COLORS[event.type]) : EVENT_COLORS[event.type],
          fields: fields.slice(0, 25).map((field) => ({
            name: truncate(field.name, 256),
            value: truncate(field.value || '-'),
            inline: field.inline,
          })),
          timestamp: new Date().toISOString(),
          footer: { text: 'LSPD HR • automatisch verarbeitet' },
        },
      ],
    }),
  })
}

function dutyStatusPayload() {
  return getDutyTimesSnapshot().then((snapshot) => {
    const activeRows = snapshot.activeRows.slice(0, 15)
    const activeList = activeRows.length > 0
      ? activeRows.map((row, index) => {
        const since = row.activeSession?.clockInAt ? formatDiscordDate(row.activeSession.clockInAt) : '-'
        const current = formatDuration(row.activeSession?.currentDurationMs ?? 0)
        const week = formatDuration(row.weekDurationMs)
        return `**${index + 1}. ${officerName(row)}**  ·  ${row.rank.name}\nDN ${officerBadge(row)}  ·  seit ${since}  ·  ${current} jetzt  ·  ${week} diese Woche`
      }).join('\n\n')
      : 'Aktuell ist kein Officer eingestempelt.'

    return {
      embeds: [
        {
          title: '🕒 LSPD Dienstzeiten',
          description: 'Live-Übersicht für Ein- und Ausstempeln. Die Buttons aktualisieren diese Anzeige automatisch.',
          color: 0xd4af37,
          fields: [
            { name: 'Eingestempelt', value: String(snapshot.activeCount), inline: true },
            { name: 'Aktive Dienstzeit', value: formatDuration(snapshot.totalActiveDurationMs), inline: true },
            { name: 'Wochenstunden gesamt', value: formatDuration(snapshot.totalWeekDurationMs), inline: true },
            { name: 'Aktuelle Officers', value: truncate(activeList, 1024), inline: false },
          ],
          timestamp: snapshot.now.toISOString(),
          footer: { text: 'LSPD HR • Dienstzeiten werden automatisch aktualisiert' },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 3, custom_id: 'lspd_duty_clock_in', label: 'Einstempeln' },
            { type: 2, style: 4, custom_id: 'lspd_duty_clock_out', label: 'Ausstempeln' },
            { type: 2, style: 2, custom_id: 'lspd_duty_refresh', label: 'Aktualisieren' },
          ],
        },
      ],
    }
  })
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

export async function sendDiscordDutyEvent(
  action: 'clock-in' | 'clock-out',
  officer: Pick<OfficerForDiscord, 'firstName' | 'lastName' | 'badgeNumber' | 'discordId'> & { rank?: { name: string; color?: string | null } | null },
  session: { clockInAt: Date; clockOutAt: Date | null },
  durationMs?: number,
) {
  await sendDiscordHrEvent({
    type: action === 'clock-in' ? 'dutyIn' : 'dutyOut',
    title: action === 'clock-in' ? `Eingestempelt: ${officerName(officer)}` : `Ausgestempelt: ${officerName(officer)}`,
    description: action === 'clock-in'
      ? `**${officerName(officer)}** ist jetzt im Dienst.`
      : `**${officerName(officer)}** hat den Dienst beendet.`,
    officer,
    fields: [
      { name: 'Start', value: formatDiscordDate(session.clockInAt), inline: true },
      ...(session.clockOutAt ? [{ name: 'Ende', value: formatDiscordDate(session.clockOutAt), inline: true }] : []),
      ...(durationMs !== undefined ? [{ name: 'Dauer', value: formatDuration(durationMs), inline: true }] : []),
    ],
  })
}

export function queueOfficerRoleSync(officerId: string, mode: 'sync' | 'remove-all' = 'sync') {
  ensureDiscordSyncScheduler()
  void syncOfficerDiscordRoles(officerId, mode).catch((error) => {
    console.error('[DiscordIntegration] Rollensync fehlgeschlagen:', error)
  })
}

export function queueAllOfficerRoleSync() {
  ensureDiscordSyncScheduler()
  void syncAllOfficerDiscordRoles().catch((error) => {
    console.error('[DiscordIntegration] Vollständiger Rollensync fehlgeschlagen:', error)
  })
}

export function queueDiscordHrEvent(event: Parameters<typeof sendDiscordHrEvent>[0]) {
  void sendDiscordHrEvent(event).catch((error) => {
    console.error('[DiscordIntegration] Event-Versand fehlgeschlagen:', error)
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
  })
}

export function queueDiscordDutyStatusUpdate() {
  void syncDiscordDutyStatusMessage().catch((error) => {
    console.error('[DiscordIntegration] Dienstzeiten-Embed fehlgeschlagen:', error)
  })
}
