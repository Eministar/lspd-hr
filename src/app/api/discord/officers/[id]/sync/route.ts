import { NextRequest } from 'next/server'
import { isAuthorizedBotRequest } from '@/lib/discord/bot-auth'
import { computeRoleSyncPlan } from '@/lib/discord/role-sync'
import { success, unauthorized, notFound } from '@/lib/api-response'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorizedBotRequest(req))) return unauthorized()
  const { id } = await params

  const plan = await computeRoleSyncPlan(id)
  if (!plan) return notFound('Officer')
  return success(plan)
}
