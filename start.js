/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Einstieg für Hosts wie Plesk (Linux), IIS/iisnode (Windows) usw.
 *
 * iisnode setzt PROCESS.env.PORT auf eine Windows-*Named Pipe* (\\.\pipe\...).
 * Diese MUSS direkt an http.Server.listen(pipe) übergeben werden — NICHT auf TCP 3000
 * ausweichen (sonst wartet IIS an der Pipe, Node lauscht woanders → 500er).
 */

process.env.NODE_ENV = 'production'

require('dotenv/config')
const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')
const { parse } = require('node:url')

const projectDir = path.resolve(__dirname)
const webhookUrl =
  String(process.env.DISCORD_WEBHOOK_URL || '').trim() ||
  String(process.env.LSPD_DISCORD_WEBHOOK_URL || '').trim()
const discordBotToken =
  String(process.env.DISCORD_BOT_TOKEN || '').trim() ||
  String(process.env.LSPD_DISCORD_BOT_TOKEN || '').trim()
const discordGatewayEnabled = String(process.env.DISCORD_BOT_GATEWAY_ENABLED || 'true').toLowerCase() !== 'false'
const discordMemberJoinSyncEnabled = String(process.env.DISCORD_MEMBER_JOIN_SYNC_ENABLED || 'true').toLowerCase() !== 'false'
const discordRoleSyncOnReady = String(process.env.DISCORD_ROLE_SYNC_ON_READY || 'true').toLowerCase() !== 'false'
const discordPresenceText = String(process.env.DISCORD_BOT_STATUS || 'LSPD HR').trim() || 'LSPD HR'

const discordSettingKeys = {
  guildId: 'discord.guildId',
  employeeRoleIds: 'discord.employeeRoleIds',
  rankRoleMap: 'discord.rankRoleMap',
  trainingRoleMap: 'discord.trainingRoleMap',
  unitRoleMap: 'discord.unitRoleMap',
}

const webhookColors = {
  info: 0x3b82f6,
  success: 0x22c55e,
  warning: 0xf59e0b,
  error: 0xef4444,
}

function truncate(value, max) {
  const text = String(value || '')
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function formatError(error) {
  if (!error) return ''
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join('\n')
  }
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return String(error)
  }
}

async function sendWebhookEvent(event) {
  if (!webhookUrl || typeof fetch !== 'function') return

  const fields = [
    ...(event.fields || []),
    { name: 'PID', value: String(process.pid), inline: true },
    { name: 'Node', value: process.version, inline: true },
  ]
  const errorText = formatError(event.error)
  if (errorText) fields.push({ name: 'Fehler', value: errorText })

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'LSPD HR Monitor',
        embeds: [
          {
            title: truncate(event.title, 250),
            description: event.description ? truncate(event.description, 1800) : undefined,
            color: webhookColors[event.severity || 'info'] || webhookColors.info,
            fields: fields.slice(0, 25).map((field) => ({
              name: truncate(field.name, 250),
              value: truncate(field.value || '-', 900),
              inline: field.inline,
            })),
            timestamp: new Date().toISOString(),
            footer: { text: 'LSPD HR Dashboard' },
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (e) {
    console.error('[DiscordWebhook] Senden fehlgeschlagen:', e)
  }
}

function queueWebhookEvent(event) {
  void sendWebhookEvent(event)
}

let prismaClient = null
let prismaCompat = null
let discordApiQueue = Promise.resolve()

function getPrismaClient() {
  if (prismaCompat) return prismaCompat
  const url = String(process.env.DATABASE_URL || '').trim()
  if (!url) throw new Error('[Prisma] DATABASE_URL fehlt oder ist leer.')

  const { PrismaClient } = require('./src/generated/prisma/client')
  const { PrismaMariaDb } = require('@prisma/adapter-mariadb')
  const adapter = new PrismaMariaDb(url)
  prismaClient = prismaClient || new PrismaClient({ adapter })
  prismaCompat = new Proxy(prismaClient, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !(prop in target)) {
        const lower = prop.toLowerCase()
        if (lower in target) return Reflect.get(target, lower, receiver)
      }
      return Reflect.get(target, prop, receiver)
    },
  })
  return prismaCompat
}

function prismaDelegate(client, ...names) {
  for (const name of names) {
    if (client[name]) return client[name]
  }
  throw new Error(`Prisma-Delegate nicht gefunden: ${names.join(' / ')}`)
}

function parseJson(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value) ?? fallback
  } catch {
    return fallback
  }
}

function cleanRoleIds(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item) => typeof item === 'string' && /^\d{17,22}$/.test(item))))
}

function cleanRoleMap(value) {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value).filter(([key, roleId]) => (
      typeof key === 'string' &&
      key.trim().length > 0 &&
      typeof roleId === 'string' &&
      /^\d{17,22}$/.test(roleId)
    )),
  )
}

function snowflake(value) {
  const id = String(value || '').trim()
  return /^\d{17,22}$/.test(id) ? id : ''
}

function normalizeUnitKeys(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item) => (
    typeof item === 'string' && item.trim().length > 0
  )).map((item) => item.trim())))
}

function officerUnitKeys(officer) {
  const units = normalizeUnitKeys(officer.units)
  if (units.length > 0) return units
  return officer.unit ? [officer.unit] : []
}

function desiredNickname(officer) {
  const name = `${officer.firstName} ${officer.lastName}`.replace(/\s+/g, ' ').trim()
  const nick = `[LSPD-${String(officer.badgeNumber || '').trim()}] ${name}`.replace(/\s+/g, ' ').trim()
  return truncate(nick, 32)
}

function trainingAvailableForOfficer(trainingRow, officer) {
  const minRank = trainingRow?.training?.minRank || trainingRow?.minRank
  return !minRank || !officer.rank || officer.rank.sortOrder <= minRank.sortOrder
}

async function getGatewayDiscordConfig() {
  const prisma = getPrismaClient()
  const systemSetting = prismaDelegate(prisma, 'systemSetting', 'systemsetting')
  const rows = await systemSetting.findMany({
    where: { key: { in: Object.values(discordSettingKeys) } },
  })
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]))

  return {
    guildId: map[discordSettingKeys.guildId] || String(process.env.DISCORD_GUILD_ID || process.env.LSPD_DISCORD_GUILD_ID || '').trim(),
    employeeRoleIds: cleanRoleIds(parseJson(map[discordSettingKeys.employeeRoleIds], [])),
    rankRoleMap: cleanRoleMap(parseJson(map[discordSettingKeys.rankRoleMap], {})),
    trainingRoleMap: cleanRoleMap(parseJson(map[discordSettingKeys.trainingRoleMap], {})),
    unitRoleMap: cleanRoleMap(parseJson(map[discordSettingKeys.unitRoleMap], {})),
  }
}

function configuredRoleIds(config) {
  return Array.from(new Set([
    ...config.employeeRoleIds,
    ...Object.values(config.rankRoleMap),
    ...Object.values(config.trainingRoleMap),
    ...Object.values(config.unitRoleMap),
  ].filter(Boolean)))
}

function desiredRoleIds(officer, config) {
  if (officer.status === 'TERMINATED') return []
  return Array.from(new Set([
    ...config.employeeRoleIds,
    config.rankRoleMap[officer.rankId],
    ...officerUnitKeys(officer).map((unitKey) => config.unitRoleMap[unitKey]),
    ...(officer.trainings || [])
      .filter((training) => training.completed && trainingAvailableForOfficer(training, officer))
      .map((training) => config.trainingRoleMap[training.trainingId]),
  ].filter(Boolean)))
}

function enqueueDiscordApi(fn) {
  return new Promise((resolve, reject) => {
    discordApiQueue = discordApiQueue.then(async () => {
      try {
        resolve(await fn())
      } catch (error) {
        reject(error)
      }
    })
  })
}

async function discordApiRaw(pathname, init = {}, attempt = 0) {
  const res = await fetch(`https://discord.com/api/v10${pathname}`, {
    ...init,
    headers: {
      authorization: `Bot ${discordBotToken}`,
      'content-type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(15000),
  })

  if (res.status === 429 && attempt < 3) {
    const body = await res.json().catch(() => ({ retry_after: 2 }))
    const waitMs = Math.min((body.retry_after || 2) * 1000, 30000)
    await new Promise((resolve) => setTimeout(resolve, waitMs + 250))
    return discordApiRaw(pathname, init, attempt + 1)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const error = new Error(`Discord API ${res.status}: ${text || res.statusText}`)
    error.status = res.status
    throw error
  }

  if (res.status === 204) return undefined
  return res.json()
}

function discordApi(pathname, init) {
  return enqueueDiscordApi(() => discordApiRaw(pathname, init))
}

async function getDiscordMember(guildId, memberId) {
  try {
    return await discordApi(`/guilds/${guildId}/members/${memberId}`)
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

async function syncGatewayOfficerMember(officer, config, member) {
  const memberId = snowflake(officer.discordId)
  if (!config.guildId || !memberId) return false

  const guildMember = member || await getDiscordMember(config.guildId, memberId)
  if (!guildMember) return false

  const allManaged = configuredRoleIds(config)
  const desired = desiredRoleIds(officer, config)
  const currentRoles = new Set(guildMember.roles || [])
  const desiredSet = new Set(desired)
  const toAdd = desired.filter((roleId) => !currentRoles.has(roleId))
  const toRemove = allManaged.filter((roleId) => currentRoles.has(roleId) && !desiredSet.has(roleId))

  for (const roleId of toRemove) {
    await discordApi(`/guilds/${config.guildId}/members/${memberId}/roles/${roleId}`, { method: 'DELETE' }).catch((error) => {
      console.error('[DiscordGateway] Rolle entfernen fehlgeschlagen:', error)
    })
  }

  for (const roleId of toAdd) {
    await discordApi(`/guilds/${config.guildId}/members/${memberId}/roles/${roleId}`, { method: 'PUT' }).catch((error) => {
      console.error('[DiscordGateway] Rolle hinzufügen fehlgeschlagen:', error)
    })
  }

  if (officer.status === 'TERMINATED') {
    if (guildMember.nick !== null) {
      await discordApi(`/guilds/${config.guildId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ nick: null }),
      }).catch((error) => {
        console.error('[DiscordGateway] Nickname-Entfernung fehlgeschlagen:', error)
      })
    }
    return true
  }

  const nick = desiredNickname(officer)
  if (guildMember.nick !== nick) {
    await discordApi(`/guilds/${config.guildId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ nick }),
    }).catch((error) => {
      console.error('[DiscordGateway] Nickname-Sync fehlgeschlagen:', error)
    })
  }

  return true
}

async function syncGatewayMemberByDiscordId(discordId, eventGuildId, member) {
  const memberId = snowflake(discordId)
  if (!memberId) return { matched: false, synced: false }

  const config = await getGatewayDiscordConfig()
  if (!config.guildId || (eventGuildId && eventGuildId !== config.guildId)) {
    return { matched: false, synced: false }
  }

  const prisma = getPrismaClient()
  const officerDelegate = prismaDelegate(prisma, 'officer')
  const officer = await officerDelegate.findUnique({
    where: { discordId: memberId },
    include: {
      rank: true,
      trainings: { include: { training: { include: { minRank: true } } } },
    },
  })
  if (!officer) return { matched: false, synced: false }

  const synced = await syncGatewayOfficerMember(officer, config, member)
  return { matched: true, synced, officer }
}

async function syncAllGatewayOfficerRoles() {
  const config = await getGatewayDiscordConfig()
  if (!config.guildId) return { synced: 0, skipped: 0, failed: 0, total: 0 }

  const prisma = getPrismaClient()
  const officerDelegate = prismaDelegate(prisma, 'officer')
  const officers = await officerDelegate.findMany({
    where: { discordId: { not: null } },
    include: {
      rank: true,
      trainings: { include: { training: { include: { minRank: true } } } },
    },
    orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
  })

  let synced = 0
  let skipped = 0
  let failed = 0
  for (const officer of officers) {
    try {
      if (await syncGatewayOfficerMember(officer, config)) synced++
      else skipped++
    } catch (error) {
      failed++
      console.error(`[DiscordGateway] Rollensync fehlgeschlagen für Officer ${officer.badgeNumber}:`, error)
    }
  }
  return { synced, skipped, failed, total: officers.length }
}

const staticContentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function safeJoin(baseDir, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.resolve(baseDir, normalized)
  return filePath.startsWith(path.resolve(baseDir) + path.sep) ? filePath : null
}

function tryServeStaticAsset(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false

  const pathname = parse(req.url || '/', false).pathname || '/'
  let filePath = null
  let immutable = false
  let isNextStatic = false

  if (pathname.startsWith('/_next/static/')) {
    try {
      filePath = safeJoin(path.join(projectDir, '.next', 'static'), decodeURIComponent(pathname.slice('/_next/static/'.length)))
      immutable = true
      isNextStatic = true
    } catch {
      res.statusCode = 400
      res.end('Bad Request')
      return true
    }
  } else if (pathname === '/favicon.ico' || pathname === '/shield.webp' || pathname === '/logo.webp') {
    filePath = safeJoin(path.join(projectDir, 'public'), decodeURIComponent(pathname.slice(1)))
  }

  if (!filePath) {
    if (isNextStatic) {
      res.statusCode = 404
      res.end('Not Found')
      return true
    }
    return false
  }

  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) {
      if (isNextStatic) {
        res.statusCode = 404
        res.setHeader('Cache-Control', 'no-store, max-age=0')
        res.end('Not Found')
        return true
      }
      return false
    }

    const ext = path.extname(filePath).toLowerCase()
    res.statusCode = 200
    res.setHeader('Content-Type', staticContentTypes[ext] || 'application/octet-stream')
    res.setHeader('Content-Length', String(stat.size))
    res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600')

    if (req.method === 'HEAD') {
      res.end()
      return true
    }

    fs.createReadStream(filePath).pipe(res)
    return true
  } catch {
    if (isNextStatic) {
      res.statusCode = 404
      res.setHeader('Cache-Control', 'no-store, max-age=0')
      res.end('Not Found')
      return true
    }
    return false
  }
}

function startDiscordBotGateway() {
  if (!discordGatewayEnabled || !discordBotToken) return
  if (typeof WebSocket !== 'function') {
    queueWebhookEvent({
      title: 'Discord Bot Gateway nicht verfügbar',
      description: 'Node stellt keinen WebSocket-Client bereit. Bot bleibt für REST-Aktionen nutzbar, wird aber nicht online angezeigt.',
      severity: 'warning',
    })
    return
  }

  let socket = null
  let heartbeatTimer = null
  let reconnectTimer = null
  let sequence = null
  let closedByReconnect = false
  let readyFullSyncStarted = false

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function scheduleReconnect(reason) {
    if (reconnectTimer) return
    clearHeartbeat()
    try {
      socket?.close()
    } catch {
      // ignore close errors
    }
    socket = null
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, 15000)

    if (reason) {
      console.warn('[DiscordGateway] Reconnect geplant:', reason)
    }
  }

  function send(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(payload))
  }

  function identify() {
    send({
      op: 2,
      d: {
        token: discordBotToken,
        intents: discordMemberJoinSyncEnabled ? 3 : 1,
        properties: {
          os: process.platform,
          browser: 'lspd-hr-dashboard',
          device: 'lspd-hr-dashboard',
        },
        presence: {
          status: 'online',
          since: null,
          afk: false,
          activities: [
            {
              name: discordPresenceText,
              type: 3,
            },
          ],
        },
      },
    })
  }

  function connect() {
    closedByReconnect = false
    socket = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json')

    socket.addEventListener('message', (event) => {
      let packet
      try {
        packet = JSON.parse(String(event.data))
      } catch {
        return
      }

      if (packet.s !== null && packet.s !== undefined) sequence = packet.s

      if (packet.op === 10) {
        const interval = Number(packet.d?.heartbeat_interval || 45000)
        clearHeartbeat()
        heartbeatTimer = setInterval(() => send({ op: 1, d: sequence }), interval)
        send({ op: 1, d: sequence })
        identify()
        return
      }

      if (packet.op === 1) {
        send({ op: 1, d: sequence })
        return
      }

      if (packet.op === 7) {
        closedByReconnect = true
        scheduleReconnect('Discord fordert Reconnect an')
        return
      }

      if (packet.op === 9) {
        sequence = null
        closedByReconnect = true
        scheduleReconnect('Discord Session ungültig')
        return
      }

      if (packet.t === 'READY') {
        const botUser = packet.d?.user
        queueWebhookEvent({
          title: 'Discord Bot online',
          description: botUser?.username ? `${botUser.username} ist mit dem Gateway verbunden.` : 'Der Discord Bot ist mit dem Gateway verbunden.',
          severity: 'success',
          fields: [{ name: 'Status', value: discordPresenceText, inline: true }],
        })

        if (discordMemberJoinSyncEnabled && discordRoleSyncOnReady && !readyFullSyncStarted) {
          readyFullSyncStarted = true
          void syncAllGatewayOfficerRoles()
            .then((result) => {
              console.log(`[DiscordGateway] Initialer Rollensync abgeschlossen: ${result.synced} synchronisiert, ${result.skipped} übersprungen, ${result.failed} fehlgeschlagen.`)
              if (result.failed > 0) {
                queueWebhookEvent({
                  title: 'Discord-Rollensync teilweise fehlgeschlagen',
                  description: 'Der initiale Sync nach Gateway-Start konnte nicht alle Officers synchronisieren.',
                  severity: 'warning',
                  fields: [
                    { name: 'Synchronisiert', value: String(result.synced), inline: true },
                    { name: 'Übersprungen', value: String(result.skipped), inline: true },
                    { name: 'Fehlgeschlagen', value: String(result.failed), inline: true },
                  ],
                })
              }
            })
            .catch((error) => {
              console.error('[DiscordGateway] Initialer Rollensync fehlgeschlagen:', error)
              queueWebhookEvent({
                title: 'Discord-Rollensync fehlgeschlagen',
                description: 'Der initiale Sync nach Gateway-Start konnte nicht abgeschlossen werden.',
                severity: 'error',
                error,
              })
            })
        }
      }

      if (packet.t === 'GUILD_MEMBER_ADD' && discordMemberJoinSyncEnabled) {
        const member = packet.d
        const memberId = member?.user?.id
        const guildId = member?.guild_id
        if (!memberId) return

        void syncGatewayMemberByDiscordId(memberId, guildId, member)
          .then((result) => {
            if (result.matched && result.synced) {
              console.log(`[DiscordGateway] Rollen für beigetretenen Discord-User ${memberId} synchronisiert.`)
            }
          })
          .catch((error) => {
            console.error('[DiscordGateway] Rollensync bei Member-Join fehlgeschlagen:', error)
            queueWebhookEvent({
              title: 'Discord-Rollensync bei Beitritt fehlgeschlagen',
              severity: 'error',
              fields: [{ name: 'Discord-ID', value: memberId, inline: true }],
              error,
            })
          })
      }
    })

    socket.addEventListener('close', (event) => {
      clearHeartbeat()
      if (event.code === 4014) {
        queueWebhookEvent({
          title: 'Discord Bot Gateway abgelehnt',
          description: 'Discord hat die Gateway-Verbindung wegen fehlender Intents abgelehnt. Für automatische Rollenvergabe beim Beitritt muss im Discord Developer Portal der Server Members Intent aktiviert sein.',
          severity: 'error',
        })
        if (discordMemberJoinSyncEnabled) return
      }
      if (!closedByReconnect) {
        scheduleReconnect(`Gateway geschlossen (${event.code || 'unbekannt'})`)
      }
    })

    socket.addEventListener('error', (event) => {
      console.error('[DiscordGateway] Fehler:', event)
      scheduleReconnect('Gateway-Fehler')
    })
  }

  connect()
}

process.on('unhandledRejection', (reason) => {
  console.error(reason)
  queueWebhookEvent({
    title: 'Unhandled Rejection',
    description: 'Eine Promise wurde im Node-Prozess nicht abgefangen.',
    severity: 'error',
    error: reason,
  })
})

process.on('uncaughtException', (error) => {
  console.error(error)
  void sendWebhookEvent({
    title: 'Uncaught Exception',
    description: 'Ein nicht abgefangener Prozessfehler ist aufgetreten.',
    severity: 'error',
    error,
  }).finally(() => {
    process.exit(1)
  })
})

/**
 * @returns {{ mode: 'pipe', target: string } | { mode: 'tcp', port: number }}
 */
function resolveListenTargetFromEnv() {
  const raw = process.env.PORT
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { mode: 'tcp', port: 3000 }
  }
  const s = String(raw).trim()
  if (/^\d+$/.test(s)) {
    const n = Number.parseInt(s, 10)
    if (Number.isFinite(n) && n >= 0 && n < 65536) {
      return { mode: 'tcp', port: n }
    }
  }
  return { mode: 'pipe', target: s }
}

async function startWithIisnodePipe(pipePath) {
  const next = require('next')

  const app = next({
    dev: false,
    dir: projectDir,
  })

  await app.prepare()
  const handle = app.getRequestHandler()

  await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        if (tryServeStaticAsset(req, res)) return

        const parsedUrl = parse(req.url, true)
        Promise.resolve(handle(req, res, parsedUrl)).catch((e) => {
          console.error(e)
          queueWebhookEvent({
            title: 'Request-Fehler',
            description: `${req.method || 'GET'} ${req.url || '/'}`,
            severity: 'error',
            fields: [{ name: 'Modus', value: 'iisnode pipe', inline: true }],
            error: e,
          })
          if (!res.headersSent) res.statusCode = 500
          res.end('Internal Server Error')
        })
      } catch (e) {
        console.error(e)
        queueWebhookEvent({
          title: 'Request-Fehler',
          description: `${req.method || 'GET'} ${req.url || '/'}`,
          severity: 'error',
          fields: [{ name: 'Modus', value: 'iisnode pipe', inline: true }],
          error: e,
        })
        if (!res.headersSent) res.statusCode = 500
        res.end('Internal Server Error')
      }
    })

    server.once('error', reject)
    server.listen(pipePath, () => resolve(undefined))
  })
}

async function startWithTcpPort(portNum) {
  process.env.PORT = String(portNum)
  const { nextStart } = require('next/dist/cli/next-start')

  await nextStart({ port: portNum }, projectDir)
}

async function main() {
  const lt = resolveListenTargetFromEnv()
  if (lt.mode === 'pipe') {
    await startWithIisnodePipe(lt.target)
    startDiscordBotGateway()
    queueWebhookEvent({
      title: 'Anwendung gestartet',
      description: 'Der Node-Prozess wurde gestartet oder neu geladen.',
      severity: 'success',
      fields: [
        { name: 'Modus', value: 'iisnode pipe', inline: true },
        { name: 'Projekt', value: projectDir },
      ],
    })
    return
  }
  await startWithTcpPort(lt.port)
  startDiscordBotGateway()
  queueWebhookEvent({
    title: 'Anwendung gestartet',
    description: 'Der Node-Prozess wurde gestartet oder neu geladen.',
    severity: 'success',
    fields: [
      { name: 'Modus', value: 'tcp', inline: true },
      { name: 'Port', value: String(lt.port), inline: true },
      { name: 'Projekt', value: projectDir },
    ],
  })
}

main().catch((err) => {
  console.error(err)
  void sendWebhookEvent({
    title: 'Start fehlgeschlagen',
    description: 'Die Anwendung konnte nicht gestartet werden.',
    severity: 'error',
    error: err,
  }).finally(() => {
    process.exit(1)
  })
})
