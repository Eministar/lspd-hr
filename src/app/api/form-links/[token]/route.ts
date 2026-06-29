import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'
import { stripCorrectAnswersFromQuestion } from '@/lib/form-tests'

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

    const existingResponse = await prisma.formResponse.findUnique({
      where: { testId_respondentId: { testId: test.id, respondentId: user.id } },
      select: { id: true, submittedAt: true, score: true, maxScore: true },
    })

    return success({
      ...test,
      questions: test.questions.map(stripCorrectAnswersFromQuestion),
      existingResponse,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
