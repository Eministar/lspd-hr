import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'
import { calculateResponseScore, normalizeSubmittedAnswers } from '@/lib/form-tests'

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

    const existingResponse = await prisma.formResponse.findUnique({
      where: { testId_respondentId: { testId: test.id, respondentId: user.id } },
      select: { id: true },
    })
    if (existingResponse) return error('Du hast diesen Test bereits abgegeben', 409)

    const { normalized, errors } = normalizeSubmittedAnswers(test.questions, body.answers)
    if (errors.length > 0) return error(errors[0])

    const score = calculateResponseScore(test.questions, normalized)
    const response = await prisma.formResponse.create({
      data: {
        testId: test.id,
        respondentId: user.id,
        respondentName: user.displayName,
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

    return success(response, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
