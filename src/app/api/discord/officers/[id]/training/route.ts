import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthorizedBotRequest } from '@/lib/discord/bot-auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { notifyDiscordBot } from '@/lib/discord/notifier'

/**
 * PATCH /api/discord/officers/:id/training
 * Body: { trainingKey: string, completed: boolean, actorDiscordId?: string, actorDisplayName?: string }
 *
 * Marks (or unmarks) a training for an officer when triggered from a Discord
 * slash command / button. The bot is responsible for verifying that the actor
 * has the required Discord HR role before invoking this endpoint.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorizedBotRequest(req))) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body.trainingKey !== 'string' || typeof body.completed !== 'boolean') {
    return error('trainingKey und completed sind erforderlich')
  }

  const training = await prisma.training.findUnique({ where: { key: body.trainingKey } })
  if (!training) return notFound('Ausbildung')

  const officer = await prisma.officer.findUnique({ where: { id } })
  if (!officer) return notFound('Officer')

  await prisma.officerTraining.upsert({
    where: { officerId_trainingId: { officerId: id, trainingId: training.id } },
    update: { completed: body.completed },
    create: { officerId: id, trainingId: training.id, completed: body.completed },
  })

  // Audit logs require a real user record; we pick the system/admin if available,
  // otherwise we attach the actor display name in the details column.
  const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } })
  if (systemUser) {
    await createAuditLog({
      action: 'TRAININGS_UPDATED',
      userId: systemUser.id,
      officerId: id,
      details: `Discord-Bot · ${body.actorDisplayName || body.actorDiscordId || 'unbekannt'}: ${training.label} → ${body.completed ? 'abgeschlossen' : 'zurückgesetzt'}`,
    })
  }

  await notifyDiscordBot({
    type: 'OFFICER_TRAININGS_UPDATED',
    officerId: id,
    actorDisplayName: body.actorDisplayName,
    trainingChanges: [{ label: training.label, completed: body.completed }],
  })

  return success({ ok: true, training: { key: training.key, label: training.label, completed: body.completed } })
}
