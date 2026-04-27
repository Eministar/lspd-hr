import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthorizedBotRequest } from '@/lib/discord/bot-auth'
import { computeRoleSyncPlan, RoleSyncPlan } from '@/lib/discord/role-sync'
import { success, unauthorized } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  if (!(await isAuthorizedBotRequest(req))) return unauthorized()

  const officers = await prisma.officer.findMany({
    where: { discordId: { not: null }, status: { not: 'TERMINATED' } },
    select: { id: true },
  })

  const plans: RoleSyncPlan[] = []
  for (const o of officers) {
    const plan = await computeRoleSyncPlan(o.id)
    if (plan && plan.discordId) plans.push(plan)
  }

  return success({ count: plans.length, plans })
}
