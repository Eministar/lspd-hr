import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'
import { buildFormSubmitterHash, stripCorrectAnswersFromQuestion } from '@/lib/form-tests'

const sessionSelect = {
  id: true,
  startedAt: true,
  expiresAt: true,
  securityEvents: true,
}

function securityEventCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const user = await requireAuth()
    const { token } = await params

    const test = await prisma.formTest.findUnique({
      where: { shareToken: token },
      include: {
        questions: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
      },
    })
    if (!test) return notFound('Test')
    if (test.status !== 'ACTIVE') return error('Dieser Link ist nicht aktiv', 403)

    const submitterHash = buildFormSubmitterHash(test.id, user.id)
    const existingResponse = await prisma.formResponse.findFirst({
      where: {
        testId: test.id,
        OR: [
          { submitterHash },
          { respondentId: user.id },
        ],
      },
      select: { id: true, submittedAt: true, score: true, maxScore: true },
    })
    if (existingResponse) {
      await prisma.formTestSession.updateMany({
        where: { testId: test.id, userId: user.id, completedAt: null },
        data: { completedAt: new Date() },
      })
    }

    let session: {
      id: string
      startedAt: Date
      expiresAt: Date | null
      securityEvents: unknown
    } | null = null

    if (!existingResponse && test.kind === 'TEST') {
      const now = new Date()
      const activeSession = await prisma.formTestSession.findFirst({
        where: { testId: test.id, userId: user.id, completedAt: null },
        orderBy: { startedAt: 'desc' },
        select: sessionSelect,
      })

      if (activeSession?.expiresAt && activeSession.expiresAt.getTime() <= now.getTime()) {
        return error('Die Zeit für diesen Test ist abgelaufen', 403)
      }

      session = activeSession
        ? await prisma.formTestSession.update({
            where: { id: activeSession.id },
            data: { lastSeenAt: now },
            select: sessionSelect,
          })
        : await prisma.formTestSession.create({
            data: {
              testId: test.id,
              userId: user.id,
              lastSeenAt: now,
              expiresAt: test.timeLimitMinutes
                ? new Date(now.getTime() + test.timeLimitMinutes * 60 * 1000)
                : null,
            },
            select: sessionSelect,
          })
    }

    return success({
      ...test,
      questions: test.questions.map(stripCorrectAnswersFromQuestion),
      existingResponse: existingResponse
        ? {
            ...existingResponse,
            score: test.kind === 'TEST' ? null : existingResponse.score,
            maxScore: test.kind === 'TEST' ? 0 : existingResponse.maxScore,
          }
        : null,
      sessionStartedAt: session?.startedAt ?? null,
      sessionExpiresAt: session?.expiresAt ?? null,
      securityEventCount: securityEventCount(session?.securityEvents),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
