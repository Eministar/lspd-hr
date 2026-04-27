import { prisma } from '@/lib/prisma'

export const DISCORD_SETTING_KEYS = [
  'discordBotApiKey',
  'discordBotPublicUrl',
  'discordGuildId',
  'discordPromotionChannelId',
  'discordTrainingChannelId',
  'discordHrLogChannelId',
  'discordTerminationChannelId',
  'discordOrgIconUrl',
] as const

export type DiscordSettingKey = (typeof DISCORD_SETTING_KEYS)[number]

export interface DiscordConfig {
  botApiKey: string
  botPublicUrl: string
  guildId: string
  promotionChannelId: string
  trainingChannelId: string
  hrLogChannelId: string
  terminationChannelId: string
  orgIconUrl: string
}

export async function loadDiscordConfig(): Promise<DiscordConfig> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...DISCORD_SETTING_KEYS] } },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    botApiKey: map.get('discordBotApiKey') || process.env.DISCORD_BOT_API_KEY || '',
    botPublicUrl: map.get('discordBotPublicUrl') || process.env.DISCORD_BOT_PUBLIC_URL || '',
    guildId: map.get('discordGuildId') || '',
    promotionChannelId: map.get('discordPromotionChannelId') || '',
    trainingChannelId: map.get('discordTrainingChannelId') || '',
    hrLogChannelId: map.get('discordHrLogChannelId') || '',
    terminationChannelId: map.get('discordTerminationChannelId') || '',
    orgIconUrl: map.get('discordOrgIconUrl') || '',
  }
}
