import { NextRequest } from 'next/server'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { createPersonFile, createReport, reportListSelect } from '@/lib/report-service'
import {
  OPEN_REPORT_STATUSES,
  cleanImageUrl,
  cleanReportLongText,
  cleanReportText,
  isReportStatus,
  sanitizeReportAttachments,
  splitPersonName,
} from '@/lib/reports'

interface PersonInput {
  personId?: unknown
  name?: unknown
  firstName?: unknown
  lastName?: unknown
  phone?: unknown
  idCardImageUrl?: unknown
  photoUrl?: unknown
}

function readPersonInput(value: unknown): PersonInput {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PersonInput : {}
}

/**
 * Verknüpft die Anzeige mit einer Personenakte: entweder mit einer bestehenden
 * (dann werden nur noch leere Felder ergänzt — ein vorhandenes Ausweisbild wird
 * nicht stillschweigend überschrieben) oder mit einer neu angelegten.
 */
async function resolvePersonFile(input: PersonInput, userId: string) {
  const personId = cleanReportText(input.personId, 40)
  const phone = cleanReportText(input.phone, 40)
  const idCardImageUrl = cleanImageUrl(input.idCardImageUrl)
  const photoUrl = cleanImageUrl(input.photoUrl)

  const fromName = splitPersonName(input.name)
  const firstName = cleanReportText(input.firstName, 80) || fromName.firstName
  const lastName = cleanReportText(input.lastName, 80) || fromName.lastName

  if (personId) {
    const existing = await prisma.personFile.findUnique({
      where: { id: personId },
      select: { id: true, phone: true, idCardImageUrl: true, photoUrl: true },
    })
    if (!existing) return null

    const patch: Prisma.PersonFileUpdateInput = {}
    if (phone && !existing.phone) patch.phone = phone
    if (idCardImageUrl && !existing.idCardImageUrl) patch.idCardImageUrl = idCardImageUrl
    if (photoUrl && !existing.photoUrl) patch.photoUrl = photoUrl
    if (Object.keys(patch).length > 0) {
      await prisma.personFile.update({ where: { id: existing.id }, data: patch })
    }

    return existing.id
  }

  if (!firstName && !lastName) return null

  const created = await createPersonFile({
    firstName,
    lastName,
    phone: phone || null,
    idCardImageUrl: idCardImageUrl || null,
    photoUrl: photoUrl || null,
    createdById: userId,
  })

  return created.id
}

function parseIncidentDate(value: unknown) {
  const raw = cleanReportText(value, 40)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission('reports:view')

    const search = cleanReportText(req.nextUrl.searchParams.get('search'), 80)
    const statusParam = req.nextUrl.searchParams.get('status')
    const personId = cleanReportText(req.nextUrl.searchParams.get('personId'), 40)

    const statusWhere = statusParam === 'OPEN'
      ? { status: { in: OPEN_REPORT_STATUSES } }
      : isReportStatus(statusParam)
        ? { status: statusParam }
        : {}

    const reports = await prisma.report.findMany({
      where: {
        ...statusWhere,
        ...(personId ? { OR: [{ suspectId: personId }, { complainantId: personId }] } : {}),
        ...(search
          ? {
              OR: [
                { caseNumber: { contains: search } },
                { charge: { contains: search } },
                { location: { contains: search } },
                { suspect: { firstName: { contains: search } } },
                { suspect: { lastName: { contains: search } } },
                { suspect: { fileNumber: { contains: search } } },
                { complainant: { firstName: { contains: search } } },
                { complainant: { lastName: { contains: search } } },
                { complainant: { fileNumber: { contains: search } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: reportListSelect,
      take: 300,
    })

    return success(reports)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission('reports:manage')
    const body = await req.json() as Record<string, unknown>

    const charge = cleanReportLongText(body.charge, 1000)
    if (!charge) return error('Der Tatvorwurf fehlt')

    const description = cleanReportLongText(body.description, 8000)
    if (!description) return error('Der Sachverhalt fehlt')

    const complainantId = await resolvePersonFile(readPersonInput(body.complainant), user.id)
    const suspectId = await resolvePersonFile(readPersonInput(body.suspect), user.id)

    const report = await createReport({
      charge,
      description,
      incidentAt: parseIncidentDate(body.incidentAt),
      location: cleanReportText(body.location, 191) || null,
      status: isReportStatus(body.status) ? body.status : 'RECORDED',
      complainantId,
      suspectId,
      attachments: sanitizeReportAttachments(body.attachments) as unknown as Prisma.InputJsonValue,
      recordedById: user.id,
      recordedByName: user.displayName,
      updates: {
        create: {
          status: 'RECORDED',
          note: 'Anzeige aufgenommen.',
          authorId: user.id,
          authorName: user.displayName,
        },
      },
    })

    await createAuditLog({
      action: 'REPORT_CREATED',
      userId: user.id,
      newValue: report.caseNumber,
      details: charge.slice(0, 200),
    })

    return success(report, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
