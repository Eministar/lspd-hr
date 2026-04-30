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
const discordPresenceText = String(process.env.DISCORD_BOT_STATUS || 'LSPD HR').trim() || 'LSPD HR'

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

  if (pathname.startsWith('/_next/static/')) {
    filePath = safeJoin(path.join(projectDir, '.next', 'static'), decodeURIComponent(pathname.slice('/_next/static/'.length)))
    immutable = true
  } else if (pathname === '/favicon.ico' || pathname === '/shield.webp' || pathname === '/logo.webp') {
    filePath = safeJoin(path.join(projectDir, 'public'), decodeURIComponent(pathname.slice(1)))
  }

  if (!filePath) return false

  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return false

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
        intents: 1,
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
      }
    })

    socket.addEventListener('close', (event) => {
      clearHeartbeat()
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
