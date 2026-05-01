import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { hasPermission } from '@/lib/permissions'
import {
  getDiscordConfig,
  getDiscordGuildChannels,
  getDiscordGuildRoles,
  queueAllOfficerRoleSync,
  saveDiscordConfig,
} from '@/lib/discord-integration'

export async function GET() {
  try {
    await requireAuth(['ADMIN'], ['settings:manage', 'ranks:manage', 'trainings:manage', 'units:manage'])

    const config = await getDiscordConfig()
    const [rolesResult, channelsResult, ranks, trainings, units] = await Promise.all([
      getDiscordGuildRoles(config.guildId).then((roles) => ({ data: roles, error: null as string | null })).catch((e: unknown) => ({
        data: [],
        error: e instanceof Error ? e.message : 'Discord-Rollen konnten nicht geladen werden',
      })),
      getDiscordGuildChannels(config.guildId).then((channels) => ({ data: channels, error: null as string | null })).catch((e: unknown) => ({
        data: [],
        error: e instanceof Error ? e.message : 'Discord-Channel konnten nicht geladen werden',
      })),
      prisma.rank.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.training.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.unit.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    ])

    return success({
      config,
      botConfigured: !!(process.env.DISCORD_BOT_TOKEN || process.env.LSPD_DISCORD_BOT_TOKEN),
      roles: rolesResult.data,
      channels: channelsResult.data,
      ranks,
      trainings,
      units,
      diagnostics: {
        guildConfigured: !!config.guildId,
        applicationConfigured: !!config.applicationId,
        announcementsChannelConfigured: !!config.announcementsChannelId,
        rolesError: rolesResult.error,
        channelsError: channelsResult.error,
      },
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
    const user = await requireAuth(['ADMIN'], ['settings:manage', 'ranks:manage', 'trainings:manage', 'units:manage'])
    const body = await req.json()
    const canManageSettings = hasPermission(user, 'settings:manage')

    await saveDiscordConfig({
      guildId: canManageSettings && typeof body.guildId === 'string' ? body.guildId : undefined,
      applicationId: canManageSettings && typeof body.applicationId === 'string' ? body.applicationId : undefined,
      announcementsChannelId: canManageSettings && typeof body.announcementsChannelId === 'string' ? body.announcementsChannelId : undefined,
      employeeRoleIds: canManageSettings && Array.isArray(body.employeeRoleIds) ? body.employeeRoleIds : undefined,
      commandRoleIds: canManageSettings && Array.isArray(body.commandRoleIds) ? body.commandRoleIds : undefined,
      rankRoleMap: hasPermission(user, 'ranks:manage') && body.rankRoleMap && typeof body.rankRoleMap === 'object' ? body.rankRoleMap : undefined,
      trainingRoleMap: hasPermission(user, 'trainings:manage') && body.trainingRoleMap && typeof body.trainingRoleMap === 'object' ? body.trainingRoleMap : undefined,
      unitRoleMap: hasPermission(user, 'units:manage') && body.unitRoleMap && typeof body.unitRoleMap === 'object' ? body.unitRoleMap : undefined,
    })
    queueAllOfficerRoleSync()

    return success({ message: 'Discord-Konfiguration gespeichert' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
