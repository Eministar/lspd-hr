import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'
import { buildFormSubmitterHash, calculateResponseScore, normalizeSubmittedAnswers } from '@/lib/form-tests'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const user = await requireAuth()
    const { token } = await params
    const body = await req.json()

    const test = await prisma.formTest.findUnique({
      where: { shareToken: token },
      include: {
        questions: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
      },
    })
    if (!test) return notFound('Test')
    if (test.status !== 'ACTIVE') return error('Dieser Link ist nicht aktiv', 403)
    if (test.questions.length === 0) return error('Dieser Test hat keine Fragen')

    const submitterHash = buildFormSubmitterHash(test.id, user.id)
    const existingResponse = await prisma.formResponse.findFirst({
      where: {
        testId: test.id,
        OR: [
          { submitterHash },
          { respondentId: user.id },
        ],
      },
      select: { id: true },
    })
    if (existingResponse) return error('Du hast diesen Test bereits abgegeben', 409)

    const now = new Date()
    const activeSession = test.kind === 'TEST'
      ? await prisma.formTestSession.findFirst({
          where: { testId: test.id, userId: user.id, completedAt: null },
          orderBy: { startedAt: 'desc' },
          select: { id: true, expiresAt: true },
        })
      : null
    if (test.kind === 'TEST' && !activeSession) return error('Keine aktive Testsitzung gefunden', 409)
    if (activeSession?.expiresAt && activeSession.expiresAt.getTime() <= now.getTime()) {
      return error('Die Zeit für diesen Test ist abgelaufen', 403)
    }

    const { normalized, errors } = normalizeSubmittedAnswers(test.questions, body.answers)
    if (errors.length > 0) return error(errors[0])

    const anonymous = test.kind === 'SURVEY' && test.anonymousResponses
    const score = test.kind === 'TEST'
      ? calculateResponseScore(test.questions, normalized)
      : { score: null, maxScore: 0 }
    const response = await prisma.$transaction(async (tx) => {
      const created = await tx.formResponse.create({
        data: {
          testId: test.id,
          respondentId: anonymous ? null : user.id,
          respondentName: anonymous ? 'Anonym' : user.displayName,
          submitterHash,
          score: score.score,
          maxScore: score.maxScore,
          answers: {
            create: normalized.map((answer) => ({
              question: { connect: { id: answer.questionId } },
              value: answer.value as Prisma.InputJsonValue,
            })),
          },
        },
        include: {
          answers: { include: { question: true } },
        },
      })

      if (activeSession) {
        await tx.formTestSession.update({
          where: { id: activeSession.id },
          data: { completedAt: now, lastSeenAt: now },
        })
      }

      return created
    })

    return success(response, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
