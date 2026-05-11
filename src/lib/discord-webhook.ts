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

const SEVERITY_ICON: Record<WebhookSeverity, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '🛑',
}

const COMPONENTS_V2_FLAG = 1 << 15

function webhookUrl() {
  return process.env.DISCORD_WEBHOOK_URL?.trim() || process.env.LSPD_DISCORD_WEBHOOK_URL?.trim() || ''
}

function truncate(value: string, max: number) {
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

function cv2Text(content: string) {
  return { type: 10, content }
}

function cv2Section(content: string) {
  return { type: 9, components: [cv2Text(content)] }
}

function cv2Separator(divider = true, spacing: 1 | 2 = 1) {
  return { type: 14, divider, spacing }
}

export async function sendDiscordWebhookEvent(event: WebhookEvent) {
  const url = webhookUrl()
  if (!url) return

  const severity = event.severity ?? 'info'
  const icon = SEVERITY_ICON[severity]
  const accentColor = COLORS[severity]
  const now = new Date()

  const headerParts = [`## ${icon} ${truncate(event.title, 200)}`]
  if (event.description) headerParts.push(truncate(event.description, 1500))

  const fieldLines: string[] = []
  for (const field of event.fields ?? []) {
    fieldLines.push(`**${truncate(field.name, 150)}** · ${truncate(field.value || '—', 400)}`)
  }
  fieldLines.push(`**Quelle** · ${event.source ?? 'server'}`)
  fieldLines.push(`**Umgebung** · ${process.env.NODE_ENV || 'unknown'}`)

  const containerComponents: unknown[] = [
    cv2Section(headerParts.join('\n')),
    cv2Separator(),
    cv2Section(fieldLines.join('\n')),
  ]

  const errorText = stringifyError(event.error)
  if (errorText) {
    containerComponents.push(cv2Separator())
    containerComponents.push(cv2Section(`**Fehlerdetails**\n\`\`\`\n${truncate(errorText, 900)}\n\`\`\``))
  }

  containerComponents.push(cv2Separator(false))
  containerComponents.push(cv2Section(
    `-# LSPD HR Monitor · ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr`,
  ))

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'LSPD HR Monitor',
        flags: COMPONENTS_V2_FLAG,
        components: [{ type: 17, accent_color: accentColor, components: containerComponents }],
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
