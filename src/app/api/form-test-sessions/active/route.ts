import { prisma } from '@/lib/prisma'
import { success, error, unauthorized } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    const user = await requireAuth()
    const now = new Date()
    const session = await prisma.formTestSession.findFirst({
      where: {
        userId: user.id,
        completedAt: null,
        test: {
          status: 'ACTIVE',
          kind: 'TEST',
        },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        startedAt: true,
        expiresAt: true,
        test: {
          select: {
            id: true,
            title: true,
            shareToken: true,
          },
        },
      },
    })

    if (!session) return success(null)

    return success({
      sessionId: session.id,
      testId: session.test.id,
      title: session.test.title,
      shareToken: session.test.shareToken,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
