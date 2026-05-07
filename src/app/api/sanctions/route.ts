import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import {
  PENAL_GRADES,
  cleanSanctionText,
  dueAtFromDeadlineDays,
  formatFineAmount,
  parseDeadlineDays,
  parseFineAmount,
  penalGradeLabel,
  sanctionInclude,
  syncSanctionDiscordMessage,
} from '@/lib/sanctions'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['terminations:manage', 'rank-changes:manage'])
    const body = await req.json()

    const officerId = cleanSanctionText(body.officerId)
    const reason = cleanSanctionText(body.reason)
    const penalGrade = cleanSanctionText(body.penalGrade).toUpperCase()
    const penalty = cleanSanctionText(body.penalty)
    const fineAmount = parseFineAmount(body.fineAmount)
    const deadlineDays = parseDeadlineDays(body.deadlineDays)

    if (!officerId) return error('Officer ist erforderlich')
    if (!reason) return error('Grund ist erforderlich')
    if (!PENAL_GRADES.has(penalGrade)) return error('Penal Grade ist erforderlich')
    if (fineAmount === undefined) return error('Geldstrafe ist ungültig')
    if (deadlineDays === undefined) return error('Frist muss zwischen 1 und 365 Tagen liegen')

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
        dueAt: dueAtFromDeadlineDays(deadlineDays),
        issuedByUserId: user.id,
        previousRank: officer.rank.name,
        previousBadgeNumber: officer.badgeNumber,
        previousFirstName: officer.firstName,
        previousLastName: officer.lastName,
      },
      include: sanctionInclude,
    })

    await createAuditLog({
      action: 'OFFICER_SANCTIONED',
      userId: user.id,
      officerId,
      newValue: penalGradeLabel(penalGrade),
      details: `${officer.firstName} ${officer.lastName}: ${penalGradeLabel(penalGrade)} · Geldstrafe: ${formatFineAmount(fineAmount)} · Frist: ${deadlineDays ? `${deadlineDays} Tage` : '—'} · Grund: ${reason}`,
    })

    await syncSanctionDiscordMessage(sanction)

    return success(sanction, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
