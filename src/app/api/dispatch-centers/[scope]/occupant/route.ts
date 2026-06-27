import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { resolveOfficerIdByDiscord } from '@/lib/patrol-sessions'

const occupantInclude = {
  officer: { select: { id: true, firstName: true, lastName: true, badgeNumber: true } },
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ scope: string }> }) {
  try {
    await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const { scope } = await params
    const body = await req.json().catch(() => ({}))
    let officerId: string | null = typeof body?.officerId === 'string' && body.officerId.trim() ? body.officerId.trim() : null
    if (!officerId) officerId = await resolveOfficerIdByDiscord(body?.officerDiscordId)
    const occupiedAt = body?.occupiedAt ? new Date(String(body.occupiedAt)) : new Date()

    const state = await prisma.dispatchCenterState.upsert({
      where: { scope },
      create: { scope, officerId, occupiedAt: Number.isNaN(occupiedAt.getTime()) ? new Date() : occupiedAt },
      update: { officerId, occupiedAt: Number.isNaN(occupiedAt.getTime()) ? new Date() : occupiedAt },
      include: occupantInclude,
    })
    return success(state)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ scope: string }> }) {
  try {
    await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const { scope } = await params
    await prisma.dispatchCenterState.upsert({
      where: { scope },
      create: { scope, officerId: null, occupiedAt: null },
      update: { officerId: null, occupiedAt: null },
    })
    return success({ scope, officerId: null })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
