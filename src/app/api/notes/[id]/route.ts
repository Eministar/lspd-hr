import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const note = await prisma.note.findUnique({ where: { id } })
  if (!note) return notFound('Notiz')
  if (note.authorId !== user.id && user.role !== 'ADMIN') return error('Keine Berechtigung', 403)

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
  if (note.authorId !== user.id && user.role !== 'ADMIN') return error('Keine Berechtigung', 403)

  await prisma.note.delete({ where: { id } })
  return success({ message: 'Notiz gelöscht' })
}
