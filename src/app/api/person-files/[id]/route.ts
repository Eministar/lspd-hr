import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { loadPersonFile, personFileSelect } from '@/lib/report-service'
import { cleanImageUrl, cleanReportLongText, cleanReportText, personDisplayName } from '@/lib/reports'

function parseBirthDate(value: unknown) {
  const raw = cleanReportText(value, 40)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('reports:view')
    const { id } = await params

    const person = await loadPersonFile(id)
    if (!person) return notFound('Personenakte')

    return success(person)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('reports:manage')
    const { id } = await params
    const body = await req.json() as Record<string, unknown>

    const existing = await prisma.personFile.findUnique({ where: { id }, select: { id: true, fileNumber: true } })
    if (!existing) return notFound('Personenakte')

    const person = await prisma.personFile.update({
      where: { id },
      data: {
        firstName: 'firstName' in body ? cleanReportText(body.firstName, 80) : undefined,
        lastName: 'lastName' in body ? cleanReportText(body.lastName, 80) : undefined,
        birthDate: 'birthDate' in body ? parseBirthDate(body.birthDate) : undefined,
        phone: 'phone' in body ? cleanReportText(body.phone, 40) || null : undefined,
        address: 'address' in body ? cleanReportText(body.address, 191) || null : undefined,
        idCardImageUrl: 'idCardImageUrl' in body ? cleanImageUrl(body.idCardImageUrl) || null : undefined,
        photoUrl: 'photoUrl' in body ? cleanImageUrl(body.photoUrl) || null : undefined,
        notes: 'notes' in body ? cleanReportLongText(body.notes, 5000) || null : undefined,
        wanted: 'wanted' in body ? body.wanted === true : undefined,
      },
      select: personFileSelect,
    })

    await createAuditLog({
      action: 'PERSON_FILE_UPDATED',
      userId: user.id,
      newValue: person.fileNumber,
      details: personDisplayName(person),
    })

    return success(person)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('reports:delete')
    const { id } = await params

    const existing = await prisma.personFile.findUnique({
      where: { id },
      select: { id: true, fileNumber: true, firstName: true, lastName: true },
    })
    if (!existing) return notFound('Personenakte')

    // Anzeigen bleiben erhalten — sie verlieren nur die Verknüpfung (onDelete:
    // SetNull). Ein Vorgang darf nicht verschwinden, weil eine Akte gelöscht wird.
    await prisma.personFile.delete({ where: { id } })

    await createAuditLog({
      action: 'PERSON_FILE_DELETED',
      userId: user.id,
      oldValue: existing.fileNumber,
      details: personDisplayName(existing),
    })

    return success({ id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
