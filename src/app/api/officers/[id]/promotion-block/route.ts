import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { queueOfficerRoleSync } from '@/lib/discord-integration'
import { syncLinkedUserDisplayNameForOfficer } from '@/lib/user-display-name'

const NOTE_TITLE = 'Uprank-Sperre'

async function setPromotionBlock(
  req: NextRequest,
  params: Promise<{ id: string }>,
  blocked: boolean,
) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['officers:promotion-block'])
    const { id } = await params

    const existing = await prisma.officer.findUnique({ where: { id }, include: { rank: true } })
    if (!existing) return notFound('Officer')

    if (existing.status === 'TERMINATED') {
      return error('Gekündigte Officer können nicht gesperrt werden.')
    }
    if (existing.promotionBlocked === blocked) {
      return success(existing)
    }

    let reason = ''
    if (blocked) {
      const body = await req.json().catch(() => ({}))
      reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    }

    const updated = await prisma.officer.update({
      where: { id },
      data: { promotionBlocked: blocked },
      include: { rank: true },
    })

    // Automatische Notiz für die Personalakte
    await prisma.note.create({
      data: {
        officerId: id,
        authorId: user.id,
        title: NOTE_TITLE,
        content: blocked
          ? `Uprank-Sperre gesetzt. Beförderungen (Aufstieg) sind für diesen Officer blockiert; Degradierungen bleiben möglich.${reason ? `\n\nGrund: ${reason}` : ''}`
          : 'Uprank-Sperre aufgehoben. Beförderungen sind wieder möglich.',
        pinned: blocked,
      },
    })

    await createAuditLog({
      action: blocked ? 'OFFICER_PROMOTION_BLOCKED' : 'OFFICER_PROMOTION_UNBLOCKED',
      userId: user.id,
      officerId: id,
      details: `${existing.firstName} ${existing.lastName}: Uprank-Sperre ${blocked ? 'gesetzt' : 'aufgehoben'}${blocked && reason ? ` (${reason})` : ''}`,
    })

    // Discord-Rolle + Umbenennung ([X]-Marker) anwenden
    await syncLinkedUserDisplayNameForOfficer(updated)
    queueOfficerRoleSync(id)

    return success(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setPromotionBlock(req, params, true)
}

export function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setPromotionBlock(req, params, false)
}
