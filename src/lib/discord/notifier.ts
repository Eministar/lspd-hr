import { loadDiscordConfig } from './config'

export type DiscordEventType =
  | 'OFFICER_PROMOTED'
  | 'OFFICER_DEMOTED'
  | 'OFFICER_TRAININGS_UPDATED'
  | 'OFFICER_TERMINATED'
  | 'OFFICER_HIRED'
  | 'OFFICER_UPDATED'
  | 'ROLE_SYNC_REQUESTED'

export interface DiscordEventPayload {
  type: DiscordEventType
  officerId: string
  actorDisplayName?: string
  oldRankName?: string
  newRankName?: string
  trainingChanges?: { label: string; completed: boolean }[]
  reason?: string
  note?: string
}

/**
 * Fire-and-forget notification to the Discord bot. The bot will then
 * (a) post a styled embed in the appropriate channel and
 * (b) recompute and apply Discord roles for the officer.
 *
 * The web app does NOT block on this — if the bot is offline, we log a warning
 * but never throw, so HR actions in the dashboard always succeed.
 */
export async function notifyDiscordBot(payload: DiscordEventPayload): Promise<void> {
  let cfg
  try {
    cfg = await loadDiscordConfig()
  } catch (err) {
    console.warn('[discord/notifier] could not load config:', err)
    return
  }

  if (!cfg.botPublicUrl || !cfg.botApiKey) {
    return
  }

  const url = cfg.botPublicUrl.replace(/\/$/, '') + '/events'

  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.botApiKey}`,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      console.warn('[discord/notifier] non-OK response', res.status)
    }
  } catch (err) {
    console.warn('[discord/notifier] delivery failed:', err)
  }
}
