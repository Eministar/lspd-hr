type WebhookSeverity = 'info' | 'success' | 'warning' | 'error'

type WebhookField = {
  name: string
  value: string
  inline?: boolean
}

type WebhookEvent = {
  title: string
  description?: string
  severity?: WebhookSeverity
  source?: string
  fields?: WebhookField[]
  error?: unknown
}

const COLORS: Record<WebhookSeverity, number> = {
  info: 0x3b82f6,
  success: 0x22c55e,
  warning: 0xf59e0b,
  error: 0xef4444,
}

const MAX_FIELD_VALUE = 900
const MAX_DESCRIPTION = 1800

function webhookUrl() {
  return process.env.DISCORD_WEBHOOK_URL?.trim() || process.env.LSPD_DISCORD_WEBHOOK_URL?.trim() || ''
}

function truncate(value: string, max = MAX_FIELD_VALUE) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function stringifyError(error: unknown) {
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

function cleanField(field: WebhookField): WebhookField {
  return {
    name: truncate(field.name, 250),
    value: truncate(field.value || '-'),
    inline: field.inline,
  }
}

export async function sendDiscordWebhookEvent(event: WebhookEvent) {
  const url = webhookUrl()
  if (!url) return

  const severity = event.severity ?? 'info'
  const fields = [
    ...(event.fields ?? []),
    { name: 'Quelle', value: event.source ?? 'server', inline: true },
    { name: 'Umgebung', value: process.env.NODE_ENV || 'unknown', inline: true },
  ]

  const errorText = stringifyError(event.error)
  if (errorText) fields.push({ name: 'Fehler', value: errorText })

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'LSPD HR Monitor',
        embeds: [
          {
            title: truncate(event.title, 250),
            description: event.description ? truncate(event.description, MAX_DESCRIPTION) : undefined,
            color: COLORS[severity],
            fields: fields.slice(0, 25).map(cleanField),
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

export function queueDiscordWebhookEvent(event: WebhookEvent) {
  void sendDiscordWebhookEvent(event)
}
