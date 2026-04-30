import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sendDiscordWebhookEvent } from '@/lib/discord-webhook'
import { success, error } from '@/lib/api-response'

const runtimeEventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().max(1200).optional(),
  digest: z.string().trim().max(160).optional(),
  path: z.string().trim().max(300).optional(),
  stack: z.string().trim().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const parsed = runtimeEventSchema.safeParse(await req.json())
    if (!parsed.success) return error('Ungültiges Runtime-Event')

    await sendDiscordWebhookEvent({
      title: parsed.data.title,
      description: parsed.data.message || 'Clientseitiger Fehler wurde gemeldet.',
      severity: 'error',
      source: 'client-runtime',
      fields: [
        { name: 'Pfad', value: parsed.data.path || req.nextUrl.pathname, inline: true },
        ...(parsed.data.digest
          ? [{ name: 'Digest', value: parsed.data.digest, inline: true }]
          : []),
        ...(parsed.data.stack ? [{ name: 'Stack', value: parsed.data.stack }] : []),
      ],
    })

    return success({ ok: true })
  } catch {
    return error('Runtime-Event konnte nicht verarbeitet werden', 500)
  }
}
