import { config } from './config.js'

export interface BackendOfficer {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  status: 'ACTIVE' | 'AWAY' | 'INACTIVE' | 'TERMINATED'
  discordId: string | null
  unit: string | null
  flag: string | null
  hireDate: string
  lastOnline?: string | null
  notes?: string | null
  rank: {
    id: string
    name: string
    color: string
    sortOrder: number
    discordRoleId: string | null
  }
  trainings: {
    id: string
    key: string
    label: string
    completed: boolean
    discordRoleId: string | null
  }[]
}

export interface BackendOfficerSummary {
  id: string
  badgeNumber: string
  firstName: string
  lastName: string
  status: 'ACTIVE' | 'AWAY' | 'INACTIVE' | 'TERMINATED'
  discordId: string | null
  unit: string | null
  flag: string | null
  hireDate: string
  rank: { id: string; name: string; color: string; sortOrder: number }
}

export interface RoleSyncPlan {
  officerId: string
  discordId: string | null
  shouldHave: string[]
  managedRoles: string[]
  rankRoleId: string | null
  trainingRoleIds: string[]
  context: {
    badgeNumber: string
    fullName: string
    rankName: string
    status: string
  }
}

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(config.backendUrl + path, {
    ...init,
    headers: {
      authorization: `Bearer ${config.backendApiKey}`,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Backend ${path} failed (${res.status})`)
  }
  return json.data as T
}

export const backend = {
  health: () => request<{ ok: boolean; ts: string }>('/api/discord/health'),
  getOfficer: (id: string) => request<BackendOfficer>(`/api/discord/officers/${encodeURIComponent(id)}`),
  getOfficerByDiscord: (discordId: string) =>
    request<BackendOfficer>(`/api/discord/officers/by-discord/${encodeURIComponent(discordId)}`),
  searchOfficers: (q: string, limit = 25) =>
    request<BackendOfficerSummary[]>(`/api/discord/officers?q=${encodeURIComponent(q)}&limit=${limit}`),
  listOfficers: (limit = 25) =>
    request<BackendOfficerSummary[]>(`/api/discord/officers?limit=${limit}`),
  listRanks: () =>
    request<{ id: string; name: string; sortOrder: number; color: string; discordRoleId: string | null }[]>('/api/discord/ranks'),
  listTrainings: () =>
    request<{ id: string; key: string; label: string; sortOrder: number; discordRoleId: string | null }[]>('/api/discord/trainings'),
  getSyncPlan: (officerId: string) =>
    request<RoleSyncPlan>(`/api/discord/officers/${encodeURIComponent(officerId)}/sync`),
  getAllSyncPlans: () =>
    request<{ count: number; plans: RoleSyncPlan[] }>('/api/discord/sync-all'),
  setTraining: (officerId: string, trainingKey: string, completed: boolean, actor: { discordId: string; displayName: string }) =>
    request<{ ok: boolean; training: { key: string; label: string; completed: boolean } }>(
      `/api/discord/officers/${encodeURIComponent(officerId)}/training`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          trainingKey,
          completed,
          actorDiscordId: actor.discordId,
          actorDisplayName: actor.displayName,
        }),
      }
    ),
}
