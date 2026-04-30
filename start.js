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
const { parse } = require('node:url')

const projectDir = path.resolve(__dirname)
const webhookUrl =
  String(process.env.DISCORD_WEBHOOK_URL || '').trim() ||
  String(process.env.LSPD_DISCORD_WEBHOOK_URL || '').trim()

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
