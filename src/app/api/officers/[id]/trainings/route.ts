import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { updateTrainingsSchema } from '@/lib/validations/officer'
import { createAuditLog } from '@/lib/audit'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['officer-trainings:manage'])
    const { id } = await params
    const body = await req.json()
    const parsed = updateTrainingsSchema.safeParse(body)
    if (!parsed.success) return error('Ungültige Daten')

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

    return success({ message: 'Ausbildungen aktualisiert', officer })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
