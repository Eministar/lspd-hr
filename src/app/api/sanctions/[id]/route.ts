import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'
import { error, notFound, success, unauthorized } from '@/lib/api-response'
import {
  PENAL_GRADES,
  cleanSanctionText,
  dueAtFromDeadlineDays,
  escalateSanction,
  formatFineAmount,
  getSanctionById,
  parseDeadlineDays,
  parseDueAt,
  parseFineAmount,
  penalGradeLabel,
  sanctionInclude,
  sanctionStatusLabel,
  syncSanctionDiscordMessage,
} from '@/lib/sanctions'

type RouteContext = { params: Promise<{ id: string }> }

function sanctionSummary(sanction: NonNullable<Awaited<ReturnType<typeof getSanctionById>>>) {
  const officerName = sanction.officer
    ? `${sanction.officer.firstName} ${sanction.officer.lastName}`
    : `${sanction.previousFirstName ?? ''} ${sanction.previousLastName ?? ''}`.trim() || 'Unbekannter Officer'
  return `${officerName}: ${penalGradeLabel(sanction.penalGrade)} · Geldstrafe: ${formatFineAmount(sanction.fineAmount)} · Status: ${sanctionStatusLabel(sanction.status)}`
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['terminations:manage', 'rank-changes:manage'])
    const { id } = await params
    const body = await req.json()
    const action = cleanSanctionText(body.action).toUpperCase()

    const existing = await getSanctionById(id)
    if (!existing) return notFound('Sanktion')

    if (action === 'MARK_PAID' || action === 'PAID') {
      const now = new Date()
      const updated = await prisma.sanction.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: existing.paidAt ?? now,
          resolvedAt: now,
        },
        include: sanctionInclude,
      })

      await createAuditLog({
        action: 'SANCTION_PAID',
        userId: user.id,
        officerId: updated.officerId ?? undefined,
        oldValue: sanctionStatusLabel(existing.status),
        newValue: sanctionStatusLabel(updated.status),
        details: sanctionSummary(updated),
      })
      await syncSanctionDiscordMessage(updated, { description: 'Sanktion wurde bezahlt.' })
      return success(updated)
    }

    if (action === 'ESCALATE' || action === 'MARK_UNPAID') {
      const result = await escalateSanction(id, { actorUserId: user.id, manual: true })
      if (!result) return error('Sanktion ist nicht mehr offen')
      return success(result)
    }

    const data: Record<string, unknown> = {}
    const changes: string[] = []

    if ('penalGrade' in body) {
      const penalGrade = cleanSanctionText(body.penalGrade).toUpperCase()
      if (!PENAL_GRADES.has(penalGrade)) return error('Penal Grade ist erforderlich')
      if (penalGrade !== existing.penalGrade) {
        data.penalGrade = penalGrade
        changes.push(`Penal Grade: ${penalGradeLabel(existing.penalGrade)} → ${penalGradeLabel(penalGrade)}`)
      }
    }

    if ('fineAmount' in body) {
      const fineAmount = parseFineAmount(body.fineAmount)
      if (fineAmount === undefined) return error('Geldstrafe ist ungültig')
      if (fineAmount !== existing.fineAmount) {
        data.fineAmount = fineAmount
        changes.push(`Geldstrafe: ${formatFineAmount(existing.fineAmount)} → ${formatFineAmount(fineAmount)}`)
      }
    }

    if ('penalty' in body) {
      const penalty = cleanSanctionText(body.penalty) || null
      if (penalty !== existing.penalty) {
        data.penalty = penalty
        changes.push('Weitere Strafe geändert')
      }
    }

    if ('reason' in body) {
      const reason = cleanSanctionText(body.reason)
      if (!reason) return error('Grund ist erforderlich')
      if (reason !== existing.reason) {
        data.reason = reason
        changes.push('Grund geändert')
      }
    }

    if ('dueAt' in body) {
      const dueAt = parseDueAt(body.dueAt)
      if (dueAt === undefined) return error('Frist ist ungültig')
      const oldTime = existing.dueAt?.getTime() ?? null
      const newTime = dueAt?.getTime() ?? null
      if (oldTime !== newTime) {
        data.dueAt = dueAt
        changes.push('Frist geändert')
      }
    } else if ('deadlineDays' in body) {
      const deadlineDays = parseDeadlineDays(body.deadlineDays)
      if (deadlineDays === undefined) return error('Frist muss zwischen 1 und 365 Tagen liegen')
      const dueAt = dueAtFromDeadlineDays(deadlineDays)
      data.dueAt = dueAt
      changes.push('Frist geändert')
    }

    if (changes.length === 0) return success(existing)

    const updated = await prisma.sanction.update({
      where: { id },
      data,
      include: sanctionInclude,
    })

    await createAuditLog({
      action: 'SANCTION_UPDATED',
      userId: user.id,
      officerId: updated.officerId ?? undefined,
      oldValue: sanctionSummary(existing),
      newValue: sanctionSummary(updated),
      details: changes.join('; '),
    })
    await syncSanctionDiscordMessage(updated, { note: 'Sanktion wurde bearbeitet.' })

    return success(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['terminations:manage', 'rank-changes:manage'])
    const { id } = await params
    const existing = await getSanctionById(id)
    if (!existing) return notFound('Sanktion')

    await syncSanctionDiscordMessage(existing, {
      description: 'Sanktion wurde gelöscht.',
      note: 'Der Eintrag wurde im HR-Dashboard gelöscht.',
      allowCreate: false,
    })

    await prisma.sanction.delete({ where: { id } })
    await createAuditLog({
      action: 'SANCTION_DELETED',
      userId: user.id,
      officerId: existing.officerId ?? undefined,
      oldValue: sanctionSummary(existing),
      details: 'Sanktion gelöscht',
    })

    return success({ message: 'Sanktion gelöscht' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
