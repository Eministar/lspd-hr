import type { Client, Guild } from 'discord.js'
import { config } from './config.js'
import { backend, type RoleSyncPlan } from './backend.js'

export interface SyncResult {
  applied: boolean
  skipped?: 'no-discord-id' | 'not-in-guild' | 'no-mapping'
  added: string[]
  removed: string[]
  error?: string
}

async function getGuild(client: Client): Promise<Guild | null> {
  try {
    return client.guilds.cache.get(config.guildId) || (await client.guilds.fetch(config.guildId))
  } catch {
    return null
  }
}

export async function applyPlan(client: Client, plan: RoleSyncPlan): Promise<SyncResult> {
  if (!plan.discordId) return { applied: false, skipped: 'no-discord-id', added: [], removed: [] }
  const guild = await getGuild(client)
  if (!guild) return { applied: false, skipped: 'not-in-guild', added: [], removed: [], error: 'Guild not reachable' }

  let member
  try {
    member = await guild.members.fetch(plan.discordId)
  } catch {
    return { applied: false, skipped: 'not-in-guild', added: [], removed: [] }
  }

  const wanted = new Set(plan.shouldHave)
  const managed = new Set(plan.managedRoles)
  const have = new Set(member.roles.cache.keys())

  const toAdd = [...wanted].filter((r) => !have.has(r))
  const toRemove = [...managed].filter((r) => have.has(r) && !wanted.has(r))

  try {
    if (toAdd.length > 0) await member.roles.add(toAdd, 'HR-Bot Auto-Sync')
    if (toRemove.length > 0) await member.roles.remove(toRemove, 'HR-Bot Auto-Sync')
    return { applied: true, added: toAdd, removed: toRemove }
  } catch (err) {
    return {
      applied: false,
      added: [],
      removed: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function syncOfficer(client: Client, officerId: string): Promise<SyncResult> {
  const plan = await backend.getSyncPlan(officerId)
  return applyPlan(client, plan)
}

export async function syncAll(client: Client): Promise<{ total: number; applied: number; failed: number; results: { officerId: string; result: SyncResult }[] }> {
  const { plans } = await backend.getAllSyncPlans()
  const results: { officerId: string; result: SyncResult }[] = []
  let applied = 0
  let failed = 0
  for (const p of plans) {
    const r = await applyPlan(client, p)
    results.push({ officerId: p.officerId, result: r })
    if (r.applied) applied++
    else if (r.error) failed++
  }
  return { total: plans.length, applied, failed, results }
}
