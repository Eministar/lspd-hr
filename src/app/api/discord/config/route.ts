import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import {
  getDiscordConfig,
  getDiscordGuildChannels,
  getDiscordGuildRoles,
  saveDiscordConfig,
} from '@/lib/discord-integration'

export async function GET() {
  try {
    await requireAuth(['ADMIN'], ['settings:manage'])

    const [config, roles, channels, ranks, trainings, units] = await Promise.all([
      getDiscordConfig(),
      getDiscordGuildRoles().catch(() => []),
      getDiscordGuildChannels().catch(() => []),
      prisma.rank.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.training.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.unit.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    ])

    return success({
      config,
      botConfigured: !!(process.env.DISCORD_BOT_TOKEN || process.env.LSPD_DISCORD_BOT_TOKEN),
      roles,
      channels,
      ranks,
      trainings,
      units,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'], ['settings:manage'])
    const body = await req.json()

    await saveDiscordConfig({
      guildId: typeof body.guildId === 'string' ? body.guildId : undefined,
      applicationId: typeof body.applicationId === 'string' ? body.applicationId : undefined,
      announcementsChannelId: typeof body.announcementsChannelId === 'string' ? body.announcementsChannelId : undefined,
      employeeRoleIds: Array.isArray(body.employeeRoleIds) ? body.employeeRoleIds : undefined,
      commandRoleIds: Array.isArray(body.commandRoleIds) ? body.commandRoleIds : undefined,
      rankRoleMap: body.rankRoleMap && typeof body.rankRoleMap === 'object' ? body.rankRoleMap : undefined,
      trainingRoleMap: body.trainingRoleMap && typeof body.trainingRoleMap === 'object' ? body.trainingRoleMap : undefined,
      unitRoleMap: body.unitRoleMap && typeof body.unitRoleMap === 'object' ? body.unitRoleMap : undefined,
    })

    return success({ message: 'Discord-Konfiguration gespeichert' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

