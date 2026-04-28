import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Validates a Bearer token coming from the Discord bot.
 *
 * The shared key is stored as a SystemSetting under the key `discordBotApiKey`,
 * but can also be supplied via the DISCORD_BOT_API_KEY environment variable so
 * that bot deployments without DB access still work during local setup.
 *
 * Returns true if the request is authenticated, false otherwise.
 */
export async function isAuthorizedBotRequest(req: NextRequest): Promise<boolean> {
  const header = req.headers.get('authorization') || req.headers.get('x-bot-key') || ''
  const provided = header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : header.trim()
  if (!provided) return false

  const envKey = process.env.DISCORD_BOT_API_KEY?.trim()
  if (envKey && envKey === provided) return true

  const row = await prisma.systemSetting.findUnique({ where: { key: 'discordBotApiKey' } })
  const dbKey = row?.value?.trim()
  if (dbKey && dbKey === provided) return true

  return false
}
