import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

const documentInclude = {
  folder: { select: { id: true, name: true } },
  createdBy: { select: { id: true, displayName: true } },
  updatedBy: { select: { id: true, displayName: true } },
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission('sru:manage')
    const body = await req.json()
    const title = cleanText(body.title)
    const folderId = cleanText(body.folderId)
    if (!title) return error('Titel ist erforderlich')

    if (folderId) {
      const folder = await prisma.sruFolder.findUnique({ where: { id: folderId }, select: { id: true } })
      if (!folder) return error('Ordner nicht gefunden', 404)
    }

    const last = await prisma.sruDocument.findFirst({
      where: { folderId: folderId || null },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })

    const document = await prisma.sruDocument.create({
      data: {
        folderId: folderId || null,
        title,
        content: typeof body.content === 'string' ? body.content : '',
        sortOrder: (last?.sortOrder ?? -1) + 1,
        createdById: user.id,
        updatedById: user.id,
      },
      include: documentInclude,
    })

    return success(document, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
