import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { updateTrainingsSchema } from '@/lib/validations/officer'
import { createAuditLog } from '@/lib/audit'
import { notifyDiscordBot } from '@/lib/discord/notifier'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'])
    const { id } = await params
    const body = await req.json()
    const parsed = updateTrainingsSchema.safeParse(body)
    if (!parsed.success) return error('Ungültige Daten')

    const before = await prisma.officerTraining.findMany({
      where: { officerId: id },
      include: { training: true },
    })
    const beforeMap = new Map(before.map((b) => [b.trainingId, b.completed]))

    for (const t of parsed.data.trainings) {
      await prisma.officerTraining.upsert({
        where: { officerId_trainingId: { officerId: id, trainingId: t.trainingId } },
        update: { completed: t.completed },
        create: { officerId: id, trainingId: t.trainingId, completed: t.completed },
      })
    }

    const officer = await prisma.officer.findUnique({
      where: { id },
      include: {
        rank: true,
        trainings: { include: { training: true } },
      },
    })
    if (!officer) return notFound('Officer')

    await createAuditLog({
      action: 'TRAININGS_UPDATED',
      userId: user.id,
      officerId: id,
      details: 'Ausbildungsstände aktualisiert',
    })

    const trainingChanges: { label: string; completed: boolean }[] = []
    for (const t of parsed.data.trainings) {
      const previously = beforeMap.get(t.trainingId) ?? false
      if (previously !== t.completed) {
        const tr = officer.trainings.find((x) => x.trainingId === t.trainingId)
        if (tr) trainingChanges.push({ label: tr.training.label, completed: t.completed })
      }
    }
    if (trainingChanges.length > 0) {
      void notifyDiscordBot({
        type: 'OFFICER_TRAININGS_UPDATED',
        officerId: id,
        actorDisplayName: user.displayName,
        trainingChanges,
      })
    }

    return success({ message: 'Ausbildungen aktualisiert', officer })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
