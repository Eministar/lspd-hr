import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { createPersonFile, personFileSelect } from '@/lib/report-service'
import { cleanImageUrl, cleanReportLongText, cleanReportText, personDisplayName } from '@/lib/reports'

function parseBirthDate(value: unknown) {
  const raw = cleanReportText(value, 40)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission(['reports:view', 'internal-affairs:view'])

    const search = cleanReportText(req.nextUrl.searchParams.get('search'), 80)
    const wantedOnly = req.nextUrl.searchParams.get('wanted') === 'true'

    const people = await prisma.personFile.findMany({
      where: {
        ...(wantedOnly ? { wanted: true } : {}),
        ...(search
          ? {
              OR: [
                { fileNumber: { contains: search } },
                { firstName: { contains: search } },
                { lastName: { contains: search } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: personFileSelect,
      take: 300,
    })

    return success(people)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(['reports:manage', 'internal-affairs:manage'])
    const body = await req.json() as Record<string, unknown>

    const firstName = cleanReportText(body.firstName, 80)
    const lastName = cleanReportText(body.lastName, 80)
    if (!firstName && !lastName) return error('Bitte gib mindestens einen Namen an')

    const person = await createPersonFile({
      firstName,
      lastName,
      birthDate: parseBirthDate(body.birthDate),
      phone: cleanReportText(body.phone, 40) || null,
      address: cleanReportText(body.address, 191) || null,
      idCardImageUrl: cleanImageUrl(body.idCardImageUrl) || null,
      photoUrl: cleanImageUrl(body.photoUrl) || null,
      notes: cleanReportLongText(body.notes, 5000) || null,
      wanted: body.wanted === true,
      createdById: user.id,
    })

    await createAuditLog({
      action: 'PERSON_FILE_CREATED',
      userId: user.id,
      newValue: person.fileNumber,
      details: personDisplayName(person),
    })

    return success(person, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
