import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { reportSelect } from '@/lib/report-service'
import { cleanReportLongText, isReportStatus } from '@/lib/reports'

/** Vermerk zur Anzeige schreiben, optional mit Statuswechsel. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(['reports:manage', 'internal-affairs:manage'])
    const { id } = await params
    const body = await req.json() as Record<string, unknown>

    const existing = await prisma.report.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!existing) return notFound('Anzeige')

    const note = cleanReportLongText(body.note, 4000)
    const nextStatus = isReportStatus(body.status) ? body.status : null
    if (!note && !nextStatus) return error('Bitte gib einen Vermerk ein oder wähle einen Status')

    await prisma.reportUpdate.create({
      data: {
        reportId: id,
        status: nextStatus,
        note: note || 'Status geändert.',
        authorId: user.id,
        authorName: user.displayName,
      },
    })

    if (nextStatus && nextStatus !== existing.status) {
      await prisma.report.update({ where: { id }, data: { status: nextStatus } })
    }

    const report = await prisma.report.findUnique({ where: { id }, select: reportSelect })
    return success(report, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
