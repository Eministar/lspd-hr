import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'

const taskInclude = {
  createdBy: { select: { id: true, displayName: true } },
  assignments: {
    include: {
      officer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          badgeNumber: true,
          rank: { select: { id: true, name: true, color: true } },
        },
      },
    },
  },
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['tasks:manage'])
    const { id } = await params
    const body = await req.json()

    if (!Array.isArray(body.officerIds)) return error('officerIds erforderlich')
    const officerIds: string[] = body.officerIds.filter(
      (v: unknown): v is string => typeof v === 'string',
    )

    const task = await prisma.task.findUnique({ where: { id }, include: { assignments: true } })
    if (!task) return notFound('Aufgabe')

    const current = new Set(task.assignments.map((a) => a.officerId))
    const next = new Set(officerIds)

    const toRemove: string[] = []
    const toAdd: string[] = []
    for (const oid of current) if (!next.has(oid)) toRemove.push(oid)
    for (const oid of next) if (!current.has(oid)) toAdd.push(oid)

    if (toAdd.length) {
      const officers = await prisma.officer.findMany({
        where: { id: { in: toAdd } },
        select: { id: true },
      })
      const valid = new Set(officers.map((o) => o.id))
      const filtered = toAdd.filter((oid) => valid.has(oid))
      if (filtered.length) {
        await prisma.taskAssignment.createMany({
          data: filtered.map((officerId) => ({ taskId: id, officerId })),
        })
      }
    }

    if (toRemove.length) {
      await prisma.taskAssignment.deleteMany({
        where: { taskId: id, officerId: { in: toRemove } },
      })
    }

    const updated = await prisma.task.findUnique({ where: { id }, include: taskInclude })
    return success(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
