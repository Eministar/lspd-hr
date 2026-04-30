/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv/config')

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

async function main() {
  if (!webhookUrl || typeof fetch !== 'function') return

  const [, , severity = 'info', title = 'LSPD HR Event', description = ''] = process.argv
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
          fields: [
            { name: 'Quelle', value: 'live-update.bat', inline: true },
            { name: 'Host', value: process.env.COMPUTERNAME || 'unknown', inline: true },
          ],
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
