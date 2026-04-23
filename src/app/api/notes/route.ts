import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(req.url)
  const officerId = searchParams.get('officerId')

  const where: Record<string, unknown> = {}
  if (officerId) {
    where.officerId = officerId
  }

  const notes = await prisma.note.findMany({
    where,
    include: {
      author: { select: { displayName: true } },
      officer: { select: { firstName: true, lastName: true, badgeNumber: true } },
    },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  })

  return success(notes)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'])
    const body = await req.json()

    if (!body.content) return error('Inhalt ist erforderlich')

    const note = await prisma.note.create({
      data: {
        officerId: body.officerId || null,
        authorId: user.id,
        title: body.title || null,
        content: body.content,
        pinned: body.pinned || false,
      },
      include: { author: { select: { displayName: true } } },
    })

    if (body.officerId) {
      await createAuditLog({
        action: 'NOTE_ADDED',
        userId: user.id,
        officerId: body.officerId,
        details: body.title || 'Notiz hinzugefügt',
      })
    }

    return success(note, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
