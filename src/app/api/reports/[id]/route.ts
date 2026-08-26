import { NextRequest } from 'next/server'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { reportSelect } from '@/lib/report-service'
import {
  REPORT_STATUS_META,
  cleanReportLongText,
  cleanReportText,
  isReportStatus,
  sanitizeReportAttachments,
} from '@/lib/reports'

function parseIncidentDate(value: unknown) {
  const raw = cleanReportText(value, 40)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(['reports:view', 'internal-affairs:view'])
    const { id } = await params

    const report = await prisma.report.findUnique({ where: { id }, select: reportSelect })
    if (!report) return notFound('Anzeige')

    return success(report)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

/**
 * Anzeige bearbeiten. Ein Statuswechsel schreibt automatisch einen
 * Verlaufseintrag — sonst stünde in der Akte nur der Endzustand, nicht der Weg
 * dorthin.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(['reports:manage', 'internal-affairs:manage'])
    const { id } = await params
    const body = await req.json() as Record<string, unknown>

    const existing = await prisma.report.findUnique({
      where: { id },
      select: { id: true, caseNumber: true, status: true },
    })
    if (!existing) return notFound('Anzeige')

    const nextStatus = 'status' in body && isReportStatus(body.status) ? body.status : null
    const statusChanged = Boolean(nextStatus && nextStatus !== existing.status)
    const statusNote = cleanReportLongText(body.statusNote, 2000)

    const report = await prisma.report.update({
      where: { id },
      data: {
        charge: 'charge' in body ? cleanReportLongText(body.charge, 1000) || undefined : undefined,
        description: 'description' in body ? cleanReportLongText(body.description, 8000) || undefined : undefined,
        incidentAt: 'incidentAt' in body ? parseIncidentDate(body.incidentAt) : undefined,
        location: 'location' in body ? cleanReportText(body.location, 191) || null : undefined,
        status: nextStatus ?? undefined,
        attachments: 'attachments' in body
          ? sanitizeReportAttachments(body.attachments) as unknown as Prisma.InputJsonValue
          : undefined,
        ...(statusChanged
          ? {
              updates: {
                create: {
                  status: nextStatus,
                  note: statusNote || `Status geändert auf „${REPORT_STATUS_META[nextStatus!].label}“.`,
                  authorId: user.id,
                  authorName: user.displayName,
                },
              },
            }
          : {}),
      },
      select: reportSelect,
    })

    if (statusChanged) {
      await createAuditLog({
        action: 'REPORT_STATUS_CHANGED',
        userId: user.id,
        oldValue: existing.status,
        newValue: nextStatus ?? '',
        details: existing.caseNumber,
      })
    }

    return success(report)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(['reports:delete', 'internal-affairs:manage'])
    const { id } = await params

    const existing = await prisma.report.findUnique({ where: { id }, select: { id: true, caseNumber: true } })
    if (!existing) return notFound('Anzeige')

    await prisma.report.delete({ where: { id } })

    await createAuditLog({
      action: 'REPORT_DELETED',
      userId: user.id,
      oldValue: existing.caseNumber,
    })

    return success({ id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
