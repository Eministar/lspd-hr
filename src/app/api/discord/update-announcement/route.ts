import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { sendDiscordUpdateAnnouncement } from '@/lib/discord-integration'

function parseLines(value: unknown) {
  if (typeof value !== 'string') return []
  return value
    .split('\n')
    .map((line) => line.replace(/^[-+!*•\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 25)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN'], ['updates:send'])
    const body = await req.json()

    if (typeof body.title !== 'string' || !body.title.trim()) {
      return error('Titel ist erforderlich')
    }

    const message = await sendDiscordUpdateAnnouncement({
      title: body.title,
      version: typeof body.version === 'string' ? body.version : undefined,
      added: parseLines(body.added),
      changed: parseLines(body.changed),
      removed: parseLines(body.removed),
      note: typeof body.note === 'string' ? body.note : undefined,
      actor: user,
    })

    return success({ message: 'Update gesendet', messageId: message.id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    if (msg === 'Update-Channel ist nicht konfiguriert' || msg === 'Discord Bot-Token fehlt' || msg === 'Mindestens ein Changelog-Eintrag ist erforderlich') {
      return error(msg, 400)
    }
    return error(msg, 500)
  }
}
