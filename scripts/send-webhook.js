/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv/config')
const fs = require('node:fs')

const webhookUrl =
  String(process.env.DISCORD_WEBHOOK_URL || '').trim() ||
  String(process.env.LSPD_DISCORD_WEBHOOK_URL || '').trim()

const colors = {
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

function readLogTail(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return ''

  const body = fs.readFileSync(filePath, 'utf8')
  const normalized = body.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''

  return truncate(normalized.slice(-850), 850)
}

async function main() {
  if (!webhookUrl || typeof fetch !== 'function') return

  const [, , severity = 'info', title = 'LSPD HR Event', description = '', logPath = ''] = process.argv
  const logTail = readLogTail(logPath)
  const fields = [
    { name: 'Quelle', value: 'live-update.bat', inline: true },
    { name: 'Host', value: process.env.COMPUTERNAME || 'unknown', inline: true },
  ]

  if (logPath) fields.push({ name: 'Logdatei', value: truncate(logPath, 900) })
  if (logTail) fields.push({ name: 'Log-Auszug', value: `\`\`\`\n${logTail}\n\`\`\`` })

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'LSPD HR Monitor',
      embeds: [
        {
          title: truncate(title, 250),
          description: truncate(description, 1800),
          color: colors[severity] || colors.info,
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: 'LSPD HR Dashboard' },
        },
      ],
    }),
    signal: AbortSignal.timeout(5000),
  })
}

main().catch((e) => {
  console.error('[DiscordWebhook] Senden fehlgeschlagen:', e)
})
