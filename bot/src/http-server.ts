import express from 'express'
import type { Client } from 'discord.js'
import { ChannelType } from 'discord.js'
import { config } from './config.js'
import { backend } from './backend.js'
import {
  promotionEmbed,
  trainingEmbed,
  terminationEmbed,
  hireEmbed,
} from './embeds.js'
import { syncOfficer } from './role-sync.js'

interface HRDiscordConfig {
  guildId: string
  channels: {
    promotion: string
    training: string
    hrLog: string
    termination: string
  }
  orgIconUrl: string
}

let cachedConfig: HRDiscordConfig | null = null
let configFetchedAt = 0
const CONFIG_TTL_MS = 30_000

async function getHRConfig(): Promise<HRDiscordConfig | null> {
  const now = Date.now()
  if (cachedConfig && now - configFetchedAt < CONFIG_TTL_MS) return cachedConfig
  try {
    const cfg = (await fetch(config.backendUrl + '/api/discord/config', {
      headers: { authorization: `Bearer ${config.backendApiKey}` },
    }).then((r) => r.json())) as { success: boolean; data?: HRDiscordConfig }
    if (cfg.success && cfg.data) {
      cachedConfig = cfg.data
      configFetchedAt = now
      return cachedConfig
    }
  } catch (err) {
    console.warn('[bot/http] could not fetch HR config:', err)
  }
  return null
}

async function postEmbed(client: Client, channelId: string, embed: ReturnType<typeof promotionEmbed>) {
  if (!channelId) return
  try {
    const ch = await client.channels.fetch(channelId)
    if (!ch) return
    if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement) return
    await ch.send({ embeds: [embed] })
  } catch (err) {
    console.warn('[bot/http] could not post embed to', channelId, err)
  }
}

export function startHttpServer(client: Client): void {
  const app = express()
  app.use(express.json({ limit: '256kb' }))

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/events', async (req, res) => {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth
    if (token !== config.backendApiKey) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const event = req.body as {
      type: string
      officerId: string
      actorDisplayName?: string
      oldRankName?: string
      newRankName?: string
      trainingChanges?: { label: string; completed: boolean }[]
      reason?: string
      note?: string
    }

    if (!event?.type || !event?.officerId) {
      res.status(400).json({ error: 'invalid payload' })
      return
    }

    res.json({ accepted: true })

    try {
      const officer = await backend.getOfficer(event.officerId)
      const cfg = await getHRConfig()

      switch (event.type) {
        case 'OFFICER_PROMOTED':
        case 'OFFICER_DEMOTED': {
          const isPromotion = event.type === 'OFFICER_PROMOTED'
          if (cfg?.channels.promotion) {
            await postEmbed(
              client,
              cfg.channels.promotion,
              promotionEmbed({
                officer,
                oldRankName: event.oldRankName || '—',
                newRankName: event.newRankName || officer.rank.name,
                isPromotion,
                actor: event.actorDisplayName,
                note: event.note,
              }),
            )
          }
          await syncOfficer(client, officer.id)
          break
        }
        case 'OFFICER_TRAININGS_UPDATED': {
          if (cfg?.channels.training && event.trainingChanges?.length) {
            await postEmbed(
              client,
              cfg.channels.training,
              trainingEmbed({
                officer,
                changes: event.trainingChanges,
                actor: event.actorDisplayName,
              }),
            )
          }
          await syncOfficer(client, officer.id)
          break
        }
        case 'OFFICER_TERMINATED': {
          if (cfg?.channels.termination) {
            await postEmbed(
              client,
              cfg.channels.termination,
              terminationEmbed({
                officer,
                reason: event.reason,
                actor: event.actorDisplayName,
              }),
            )
          }
          await syncOfficer(client, officer.id)
          break
        }
        case 'OFFICER_HIRED': {
          if (cfg?.channels.hrLog) {
            await postEmbed(
              client,
              cfg.channels.hrLog,
              hireEmbed({ officer, actor: event.actorDisplayName }),
            )
          }
          await syncOfficer(client, officer.id)
          break
        }
        case 'OFFICER_UPDATED':
        case 'ROLE_SYNC_REQUESTED': {
          await syncOfficer(client, officer.id)
          break
        }
        default:
          console.warn('[bot/http] unknown event type', event.type)
      }
    } catch (err) {
      console.warn('[bot/http] event handling failed:', err)
    }
  })

  app.listen(config.httpPort, () => {
    console.log(`[bot/http] listening on :${config.httpPort}`)
  })
}
