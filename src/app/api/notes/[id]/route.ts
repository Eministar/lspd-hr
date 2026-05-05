import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { hasPermission } from '@/lib/permissions'
import { INACTIVITY_NOTE_DISMISSED_ACTION, SYSTEM_NOTE_TITLE } from '@/lib/absence-status'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const note = await prisma.note.findUnique({ where: { id } })
  if (!note) return notFound('Notiz')
  if (note.authorId !== user.id && !hasPermission(user, 'notes:manage')) return error('Keine Berechtigung', 403)

  const body = await req.json()
  const updated = await prisma.note.update({
    where: { id },
    data: {
      title: body.title,
      content: body.content,
      pinned: body.pinned,
    },
    include: { author: { select: { displayName: true } } },
  })

  return success(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const note = await prisma.note.findUnique({ where: { id } })
  if (!note) return notFound('Notiz')
  if (note.authorId !== user.id && !hasPermission(user, 'notes:manage')) return error('Keine Berechtigung', 403)

  await prisma.$transaction(async (tx) => {
    if (note.officerId && note.title === SYSTEM_NOTE_TITLE) {
      await tx.auditLog.create({
        data: {
          action: INACTIVITY_NOTE_DISMISSED_ACTION,
          userId: user.id,
          officerId: note.officerId,
          details: 'Automatische Fehlzeit-Notiz gelöscht',
        },
      })
    }

    await tx.note.delete({ where: { id } })
  })
  return success({ message: 'Notiz gelöscht' })
}
