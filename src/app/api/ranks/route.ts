import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const ranks = await prisma.rank.findMany({ orderBy: { sortOrder: 'asc' } })
  return success(ranks)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN'])
    const body = await req.json()

    if (!body.name) return error('Name ist erforderlich')
    
    const rank = await prisma.rank.create({
      data: {
        name: body.name,
        sortOrder: body.sortOrder ?? 0,
        color: body.color ?? '#3B82F6',
      },
    })

    return success(rank, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
