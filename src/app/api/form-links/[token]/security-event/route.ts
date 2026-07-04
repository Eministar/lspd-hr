import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'
import { cleanFormText } from '@/lib/form-tests'
import { isFormTestSessionWriteConflict, recordFormTestSessionSecurityEvent } from '@/lib/form-test-sessions'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const user = await requireAuth()
    const { token } = await params
    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
    const type = cleanFormText(input.type, 80) || 'unknown'

    const test = await prisma.formTest.findUnique({
      where: { shareToken: token },
      select: { id: true, kind: true, status: true },
    })
    if (!test) return notFound('Test')
    if (test.kind !== 'TEST' || test.status !== 'ACTIVE') return success({ recorded: false })

    const now = new Date()
    const session = await prisma.formTestSession.findFirst({
      where: {
        testId: test.id,
        userId: user.id,
        completedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    })
    if (!session) return success({ recorded: false })

    const result = await recordFormTestSessionSecurityEvent(session.id, type, now)

    return success(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    if (isFormTestSessionWriteConflict(e)) return success({ recorded: false })
    return error(msg, 500)
  }
}
