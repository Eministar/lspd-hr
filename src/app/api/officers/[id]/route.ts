import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, getCurrentUser } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { updateOfficerSchema } from '@/lib/validations/officer'
import { createAuditLog } from '@/lib/audit'
import { notifyDiscordBot } from '@/lib/discord/notifier'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const officer = await prisma.officer.findUnique({
    where: { id },
    include: {
      rank: true,
      trainings: { include: { training: true } },
      promotionLogs: {
        include: { oldRank: true, newRank: true, performedBy: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
      },
      terminations: {
        include: { terminatedBy: { select: { displayName: true } } },
        orderBy: { terminatedAt: 'desc' },
      },
      officerNotes: {
        include: { author: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!officer) return notFound('Officer')
  return success(officer)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'])
    const { id } = await params
    const body = await req.json()
    const parsed = updateOfficerSchema.safeParse(body)
    if (!parsed.success) return error(parsed.error.issues.map(e => e.message).join(', '))

    const existing = await prisma.officer.findUnique({ where: { id }, include: { rank: true } })
    if (!existing) return notFound('Officer')

    if (parsed.data.badgeNumber && parsed.data.badgeNumber !== existing.badgeNumber) {
      const dup = await prisma.officer.findUnique({ where: { badgeNumber: parsed.data.badgeNumber } })
      if (dup) return error('Dienstnummer bereits vergeben')
    }

    const updated = await prisma.officer.update({
      where: { id },
      data: {
        ...parsed.data,
        hireDate: parsed.data.hireDate ? new Date(parsed.data.hireDate) : undefined,
      },
      include: { rank: true },
    })

    const changes: string[] = []
    if (parsed.data.firstName && parsed.data.firstName !== existing.firstName) changes.push(`Vorname: ${existing.firstName} → ${parsed.data.firstName}`)
    if (parsed.data.lastName && parsed.data.lastName !== existing.lastName) changes.push(`Nachname: ${existing.lastName} → ${parsed.data.lastName}`)
    if (parsed.data.badgeNumber && parsed.data.badgeNumber !== existing.badgeNumber) changes.push(`Dienstnummer: ${existing.badgeNumber} → ${parsed.data.badgeNumber}`)
    if (parsed.data.status && parsed.data.status !== existing.status) changes.push(`Status: ${existing.status} → ${parsed.data.status}`)
    if (parsed.data.rankId && parsed.data.rankId !== existing.rankId) changes.push(`Rang geändert`)
    if ('unit' in parsed.data && parsed.data.unit !== existing.unit) {
      changes.push(`Unit: ${existing.unit ?? '—'} → ${parsed.data.unit ?? '—'}`)
    }
    if ('flag' in parsed.data && parsed.data.flag !== existing.flag) {
      changes.push(`Markierung: ${existing.flag ?? '—'} → ${parsed.data.flag ?? '—'}`)
    }

    if (changes.length > 0) {
      await createAuditLog({
        action: 'OFFICER_UPDATED',
        userId: user.id,
        officerId: id,
        details: changes.join('; '),
      })

      // Trigger a Discord role re-sync whenever rank or status changes (and on
      // discordId assignment so newly linked officers get their roles).
      const triggersSync =
        (parsed.data.rankId && parsed.data.rankId !== existing.rankId) ||
        (parsed.data.status && parsed.data.status !== existing.status) ||
        ('discordId' in parsed.data && parsed.data.discordId !== existing.discordId)
      if (triggersSync) {
        void notifyDiscordBot({
          type: 'OFFICER_UPDATED',
          officerId: id,
          actorDisplayName: user.displayName,
        })
      }
    }

    return success(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN'])
    const { id } = await params

    const officer = await prisma.officer.findUnique({ where: { id } })
    if (!officer) return notFound('Officer')

    await prisma.officer.delete({ where: { id } })

    await createAuditLog({
      action: 'OFFICER_DELETED',
      userId: user.id,
      details: `${officer.firstName} ${officer.lastName} (${officer.badgeNumber}) gelöscht`,
    })

    return success({ message: 'Officer gelöscht' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
