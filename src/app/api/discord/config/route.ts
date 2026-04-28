import { NextRequest } from 'next/server'
import { isAuthorizedBotRequest } from '@/lib/discord/bot-auth'
import { loadDiscordConfig } from '@/lib/discord/config'
import { success, unauthorized } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  if (!(await isAuthorizedBotRequest(req))) return unauthorized()
  const cfg = await loadDiscordConfig()
  return success({
    guildId: cfg.guildId,
    channels: {
      promotion: cfg.promotionChannelId,
      training: cfg.trainingChannelId,
      hrLog: cfg.hrLogChannelId,
      termination: cfg.terminationChannelId,
    },
    orgIconUrl: cfg.orgIconUrl,
  })
}
