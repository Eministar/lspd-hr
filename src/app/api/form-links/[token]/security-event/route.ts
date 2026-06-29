import { NextRequest } from 'next/server'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'
import { cleanFormText } from '@/lib/form-tests'

const MAX_SECURITY_EVENTS = 80

function readSecurityEvents(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .slice(-MAX_SECURITY_EVENTS + 1)
    : []
}

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
      select: { id: true, securityEvents: true },
    })
    if (!session) return success({ recorded: false })

    const events = [
      ...readSecurityEvents(session.securityEvents),
      { type, at: now.toISOString() },
    ]

    await prisma.formTestSession.update({
      where: { id: session.id },
      data: {
        lastSeenAt: now,
        securityEvents: events as Prisma.InputJsonValue,
      },
    })

    return success({ recorded: true, count: events.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
