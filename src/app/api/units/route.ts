import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { isUniqueConstraintError } from '@/lib/prisma-errors'

function createUnitKey(name: string) {
  return name
    .trim()
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const activeOnly = req.nextUrl.searchParams.get('active') === 'true'
  const units = await prisma.unit.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return success(units)
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'], ['units:manage'])
    const body = await req.json()

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return error('Name ist erforderlich')

    const key = createUnitKey(name)
    if (!key) return error('Name ergibt keinen gültigen Unit-Key')

    const unit = await prisma.unit.create({
      data: {
        key,
        name,
        color: typeof body.color === 'string' && body.color ? body.color : '#d4af37',
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
        active: typeof body.active === 'boolean' ? body.active : true,
      },
    })

    return success(unit, 201)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Unit existiert bereits')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
