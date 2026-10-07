import { NextRequest } from 'next/server'
import { suspensionSchema } from '@/lib/suspension'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { queueOfficerRoleSync } from '@/lib/discord-integration'
import { syncLinkedUserDisplayNameForOfficer } from '@/lib/user-display-name'

async function update(req: NextRequest, params: Promise<{ id: string }>, suspend: boolean) {
  try {
    const user = await requirePermission('officers:write')
    const { id } = await params
    const parsed = suspend ? suspensionSchema.safeParse(await req.json().catch(() => null)) : null
    if (suspend && !parsed?.success) return error('Bitte eine Dauer von 1 bis 8760 Stunden und einen Grund mit maximal 2000 Zeichen angeben.')
    const suspendedUntil = parsed?.success ? new Date(Date.now() + parsed.data.durationHours * 3600000) : null
    const reason = parsed?.success ? parsed.data.reason : ''
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.officer.findUnique({ where: { id } })
      if (!existing) return null
      if (existing.status === 'TERMINATED') throw new Error('TERMINATED')
      const officer = await tx.officer.update({
        where: { id }, data: { suspendedUntil, suspensionReason: reason || null },
      })
      const content = suspendedUntil
        ? `Suspendiert bis ${suspendedUntil.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} (Europe/Berlin).${reason ? ` Grund: ${reason}` : ''}`
        : 'Suspendierung vorzeitig aufgehoben.'
      await tx.note.create({ data: { officerId: id, authorId: user.id, title: 'Suspendierung', content } })
      await tx.auditLog.create({ data: {
        officerId: id, userId: user.id,
        action: suspend ? 'OFFICER_SUSPENDED' : 'OFFICER_UNSUSPENDED',
        oldValue: existing.suspendedUntil?.toISOString() ?? null,
        newValue: suspendedUntil?.toISOString() ?? null, details: content,
      } })
      return officer
    })
    if (!result) return notFound('Officer')
    queueOfficerRoleSync(id)
    await syncLinkedUserDisplayNameForOfficer(result).catch((err) => console.error('[Suspension] Anzeigename:', err))
    return success(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    if (msg === 'TERMINATED') return error('Gekündigte Officer können nicht suspendiert werden.')
    return error(msg, 500)
  }
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return update(req, params, true)
}
export function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return update(req, params, false)
}
