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

const SEVERITY_LABEL: Record<WebhookSeverity, string> = {
  info: 'Information',
  success: 'Erfolg',
  warning: 'Warnung',
  error: 'Fehler',
}

const MAX_FIELD_VALUE = 1024
const MAX_DESCRIPTION = 4096

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
    value: truncate(field.value || '—'),
    inline: field.inline,
  }
}

export async function sendDiscordWebhookEvent(event: WebhookEvent) {
  const url = webhookUrl()
  if (!url) return

  const severity = event.severity ?? 'info'
  const now = new Date()
  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })

  const descParts: string[] = []
  if (event.description) {
    descParts.push(event.description.split('\n').map(l => `> ${l}`).join('\n'))
  }
  descParts.push(`- **Quelle:** \`${event.source ?? 'server'}\`  ·  **Umgebung:** \`${process.env.NODE_ENV || 'unknown'}\``)
  const description = truncate(descParts.join('\n\n'), MAX_DESCRIPTION)

  const fields: WebhookField[] = (event.fields ?? []).map(cleanField)

  const errorText = stringifyError(event.error)
  if (errorText) {
    fields.push({ name: 'Fehlerdetails', value: `\`\`\`\n${truncate(errorText, MAX_FIELD_VALUE - 8)}\n\`\`\``, inline: false })
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'LSPD Department Monitor',
        embeds: [
          {
            author: { name: SEVERITY_LABEL[severity] },
            title: truncate(event.title, 250),
            description,
            color: COLORS[severity],
            fields: fields.slice(0, 25).map(cleanField),
            timestamp: now.toISOString(),
            footer: { text: `LSPD Department Dashboard · System-Monitor · ${timeStr} Uhr` },
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[DiscordWebhook] HTTP ${res.status}: ${text}`)
    }
  } catch (e) {
    console.error('[DiscordWebhook] Senden fehlgeschlagen:', e)
  }
}

export function queueDiscordWebhookEvent(event: WebhookEvent) {
  void sendDiscordWebhookEvent(event)
}
