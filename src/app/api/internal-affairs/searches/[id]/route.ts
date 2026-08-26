import { createAuditLog } from '@/lib/audit'
import { error, notFound, success, unauthorized } from '@/lib/api-response'
import { requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('internal-affairs:manage')
    const { id } = await params
    const entry = await prisma.officerSearch.findUnique({
      where: { id },
      include: { officer: { select: { firstName: true, lastName: true } } },
    })
    if (!entry) return notFound('Durchsuchung')

    await prisma.officerSearch.delete({ where: { id } })
    await createAuditLog({
      action: 'OFFICER_SEARCH_DELETED',
      userId: user.id,
      officerId: entry.officerId,
      details: `${entry.officer.firstName} ${entry.officer.lastName} · Durchsuchung vom ${entry.conductedAt.toLocaleDateString('de-DE')}`,
    })

    return success({ message: 'Durchsuchung gelöscht' })
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'Serverfehler'
    if (message === 'Unauthorized') return unauthorized()
    if (message === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(message, 500)
  }
}
