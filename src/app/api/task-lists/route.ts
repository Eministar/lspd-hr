import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

const VALID_MODULES = ['ACADEMY', 'HR'] as const
type ModuleKey = (typeof VALID_MODULES)[number]

function isModule(value: string | null): value is ModuleKey {
  return !!value && (VALID_MODULES as readonly string[]).includes(value)
}

const taskListInclude = {
  createdBy: { select: { id: true, displayName: true } },
  tasks: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      createdBy: { select: { id: true, displayName: true } },
      assignments: {
        include: {
          officer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              badgeNumber: true,
              rank: { select: { id: true, name: true, color: true } },
            },
          },
        },
      },
    },
  },
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(req.url)
  const moduleParam = searchParams.get('module')
  const includeArchived = searchParams.get('archived') === 'true'

  const where: Record<string, unknown> = {}
  if (isModule(moduleParam)) where.module = moduleParam
  if (!includeArchived) where.archived = false

  const lists = await prisma.taskList.findMany({
    where,
    include: taskListInclude,
    orderBy: [{ archived: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return success(lists)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'])
    const body = await req.json()

    if (!isModule(body.module)) return error('Ungültiges Modul')
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return error('Titel ist erforderlich')

    const last = await prisma.taskList.findFirst({
      where: { module: body.module },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })

    const list = await prisma.taskList.create({
      data: {
        module: body.module,
        title,
        description: body.description?.toString().trim() || null,
        color: typeof body.color === 'string' && body.color ? body.color : '#d4af37',
        sortOrder: (last?.sortOrder ?? -1) + 1,
        createdById: user.id,
      },
      include: taskListInclude,
    })

    return success(list, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
