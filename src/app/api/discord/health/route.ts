import { NextRequest } from 'next/server'
import { isAuthorizedBotRequest } from '@/lib/discord/bot-auth'
import { success, unauthorized } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  if (!(await isAuthorizedBotRequest(req))) return unauthorized()
  return success({ ok: true, ts: new Date().toISOString() })
}
