import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { queueDiscordHrEvent } from '@/lib/discord-integration'

const PENAL_GRADES = new Set(['I', 'II', 'III', 'IV', 'V', 'MANUELL'])

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseFineAmount(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const raw = typeof value === 'number'
    ? String(value)
    : String(value).replace(/[^\d]/g, '')
  if (!raw) return null

  const amount = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(amount) || amount < 0) return undefined
  if (amount > 1_000_000) return undefined
  return amount
}

function formatFineAmount(value: number | null) {
  if (value === null) return '—'
  return `${new Intl.NumberFormat('de-DE').format(value)} $`
}

function penalGradeLabel(value: string) {
  return value === 'MANUELL' ? 'Manuell' : `Penal Grade ${value}`
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['terminations:manage', 'rank-changes:manage'])
    const body = await req.json()

    const officerId = cleanText(body.officerId)
    const reason = cleanText(body.reason)
    const penalGrade = cleanText(body.penalGrade).toUpperCase()
    const penalty = cleanText(body.penalty)
    const fineAmount = parseFineAmount(body.fineAmount)

    if (!officerId) return error('Officer ist erforderlich')
    if (!reason) return error('Grund ist erforderlich')
    if (!PENAL_GRADES.has(penalGrade)) return error('Penal Grade ist erforderlich')
    if (fineAmount === undefined) return error('Geldstrafe ist ungültig')

    const officer = await prisma.officer.findUnique({
      where: { id: officerId },
      include: { rank: true },
    })
    if (!officer) return error('Officer nicht gefunden')
    if (officer.status === 'TERMINATED') return error('Gekündigte Officers können keine neue Sanktion erhalten')

    const sanction = await prisma.sanction.create({
      data: {
        officerId,
        reason,
        penalGrade,
        fineAmount,
        penalty: penalty || null,
        issuedByUserId: user.id,
        previousRank: officer.rank.name,
        previousBadgeNumber: officer.badgeNumber,
        previousFirstName: officer.firstName,
        previousLastName: officer.lastName,
      },
      include: {
        issuedBy: { select: { displayName: true } },
      },
    })

    await createAuditLog({
      action: 'OFFICER_SANCTIONED',
      userId: user.id,
      officerId,
      newValue: penalGradeLabel(penalGrade),
      details: `${officer.firstName} ${officer.lastName}: ${penalGradeLabel(penalGrade)} · Geldstrafe: ${formatFineAmount(fineAmount)} · Grund: ${reason}`,
    })

    queueDiscordHrEvent({
      type: 'sanction',
      title: `Sanktion: ${officer.firstName} ${officer.lastName}`,
      officer,
      actor: user,
      fields: [
        { name: 'Penal Grade', value: penalGradeLabel(penalGrade), inline: true },
        { name: 'Geldstrafe', value: formatFineAmount(fineAmount), inline: true },
        { name: 'Weitere Strafe', value: penalty || '—', inline: false },
        { name: 'Grund', value: reason, inline: false },
      ],
    })

    return success(sanction, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
