import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'

const documentInclude = {
  folder: { select: { id: true, name: true } },
  createdBy: { select: { id: true, displayName: true } },
  updatedBy: { select: { id: true, displayName: true } },
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('sru:manage')
    const { id } = await params
    const body = await req.json()

    const existing = await prisma.sruDocument.findUnique({ where: { id } })
    if (!existing) return notFound('Dokument')

    const data: Record<string, unknown> = { updatedById: user.id }
    if ('title' in body) {
      const title = cleanText(body.title)
      if (!title) return error('Titel ist erforderlich')
      data.title = title
    }
    if ('content' in body) data.content = typeof body.content === 'string' ? body.content : ''
    if ('folderId' in body) {
      const folderId = cleanText(body.folderId)
      if (folderId) {
        const folder = await prisma.sruFolder.findUnique({ where: { id: folderId }, select: { id: true } })
        if (!folder) return error('Ordner nicht gefunden', 404)
      }
      data.folderId = folderId || null
    }
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder

    const document = await prisma.sruDocument.update({
      where: { id },
      data,
      include: documentInclude,
    })

    return success(document)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('sru:manage')
    const { id } = await params
    const document = await prisma.sruDocument.findUnique({ where: { id } })
    if (!document) return notFound('Dokument')

    await prisma.sruDocument.delete({ where: { id } })
    return success({ message: 'Dokument gelöscht' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
