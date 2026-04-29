import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

export async function GET() {
  try {
    await requirePermission('trainings:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }

  const trainings = await prisma.training.findMany({ orderBy: { sortOrder: 'asc' } })
  return success(trainings)
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'], ['trainings:manage'])
    const body = await req.json()

    if (!body.key || !body.label) return error('Key und Label sind erforderlich')
    
    const training = await prisma.training.create({
      data: {
        key: body.key,
        label: body.label,
        sortOrder: body.sortOrder ?? 0,
      },
    })

    return success(training, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}
