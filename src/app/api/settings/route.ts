import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, getCurrentUser } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const settings = await prisma.systemSetting.findMany()
  const map: Record<string, string> = {}
  settings.forEach((s) => { map[s.key] = s.value })
  return success(map)
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'])
    const body = await req.json()

    if (!body.key || body.value === undefined) return error('Key und Value sind erforderlich')

    await prisma.systemSetting.upsert({
      where: { key: body.key },
      update: { value: String(body.value) },
      create: { key: body.key, value: String(body.value) },
    })

    return success({ message: 'Einstellung gespeichert' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    return error(msg, 500)
  }
}
