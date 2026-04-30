import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { updateTrainingsSchema } from '@/lib/validations/officer'
import { createAuditLog } from '@/lib/audit'
import { queueDiscordHrEvent, queueOfficerRoleSync } from '@/lib/discord-integration'

function trainingStateLabel(completed: boolean) {
  return completed ? 'abgeschlossen' : 'offen'
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['officer-trainings:manage'])
    const { id } = await params
    const body = await req.json()
    const parsed = updateTrainingsSchema.safeParse(body)
    if (!parsed.success) return error('Ungültige Daten')

    const previousOfficer = await prisma.officer.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        badgeNumber: true,
        trainings: { include: { training: true } },
      },
    })
    if (!previousOfficer) return notFound('Officer')

    const previousByTrainingId = new Map(
      previousOfficer.trainings.map((training) => [training.trainingId, training]),
    )

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

    const changedTrainings = parsed.data.trainings.flatMap((trainingUpdate) => {
      const previous = previousByTrainingId.get(trainingUpdate.trainingId)
      if (previous?.completed === trainingUpdate.completed) return []

      const current = officer.trainings.find((training) => training.trainingId === trainingUpdate.trainingId)
      const label = current?.training.label ?? previous?.training.label ?? trainingUpdate.trainingId
      return [
        `${label}: ${trainingStateLabel(previous?.completed ?? false)} → ${trainingStateLabel(trainingUpdate.completed)}`,
      ]
    })

    if (changedTrainings.length > 0) {
      await createAuditLog({
        action: 'TRAININGS_UPDATED',
        userId: user.id,
        officerId: id,
        oldValue: `${previousOfficer.firstName} ${previousOfficer.lastName} (${previousOfficer.badgeNumber})`,
        newValue: changedTrainings.join(', '),
        details: `Ausbildungsstand geändert: ${changedTrainings.join('; ')}`,
      })

      queueOfficerRoleSync(id)
      queueDiscordHrEvent({
        type: 'training',
        title: 'Ausbildung aktualisiert',
        description: 'Der Ausbildungsstand eines Officers wurde geändert.',
        officer,
        fields: [
          { name: 'Geändert von', value: user.displayName, inline: true },
          { name: 'Änderungen', value: changedTrainings.join('\n') },
        ],
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
