import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'

const PROBATION_STATUSES = new Set(['ACTIVE', 'PASSED', 'EXTENDED', 'FAILED'])
type ProbationStatusValue = 'ACTIVE' | 'PASSED' | 'EXTENDED' | 'FAILED'

function probationStatus(value: string): ProbationStatusValue | null {
  return PROBATION_STATUSES.has(value) ? value as ProbationStatusValue : null
}

const DEFAULT_CHECKLIST = [
  { id: 'grundausbildung', label: 'Grundausbildung geprüft', completed: false },
  { id: 'dienstzeiten', label: 'Dienstzeiten ausreichend', completed: false },
  { id: 'verhalten', label: 'Verhalten bewertet', completed: false },
  { id: 'abschlussgespraech', label: 'Abschlussgespräch geführt', completed: false },
]

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeChecklist(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_CHECKLIST
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        id: cleanText(row.id) || cleanText(row.label).toLowerCase().replace(/\s+/g, '-'),
        label: cleanText(row.label),
        completed: row.completed === true,
      }
    })
    .filter((item) => item.id && item.label)
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission('probations:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }

  const status = probationStatus(req.nextUrl.searchParams.get('status') || '')
  const probations = await prisma.probation.findMany({
    where: status ? { status } : undefined,
    include: {
      officer: { include: { rank: true } },
      createdBy: { select: { displayName: true } },
      decidedBy: { select: { displayName: true } },
    },
    orderBy: [{ status: 'asc' }, { endsAt: 'asc' }],
  })

  return success(probations)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission('probations:manage')
    const body = await req.json()
    const officerId = cleanText(body.officerId)
    const startsAt = parseDate(body.startsAt) ?? new Date()
    const endsAt = parseDate(body.endsAt)
    const checklist = normalizeChecklist(body.checklist)

    if (!officerId) return error('Officer ist erforderlich')
    if (!endsAt) return error('Probezeit-Enddatum ist erforderlich')
    if (endsAt < startsAt) return error('Probezeit-Ende darf nicht vor dem Start liegen')

    const officer = await prisma.officer.findUnique({
      where: { id: officerId },
      include: { rank: true },
    })
    if (!officer) return error('Officer nicht gefunden', 404)
    if (officer.status === 'TERMINATED') return error('Gekündigte Officers können keine aktive Probezeit erhalten')

    const probation = await prisma.probation.upsert({
      where: { officerId },
      create: {
        officerId,
        startsAt,
        endsAt,
        checklist,
        createdById: user.id,
      },
      update: {
        startsAt,
        endsAt,
        checklist,
        status: 'ACTIVE',
        resultNote: null,
        decidedAt: null,
        decidedById: null,
      },
      include: {
        officer: { include: { rank: true } },
        createdBy: { select: { displayName: true } },
        decidedBy: { select: { displayName: true } },
      },
    })

    await createAuditLog({
      action: 'PROBATION_STARTED',
      userId: user.id,
      officerId,
      details: `${officer.firstName} ${officer.lastName} bis ${endsAt.toLocaleDateString('de-DE')}`,
    })

    return success(probation, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
