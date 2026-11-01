/**
 * Private Clips-Channels pro Officer (portiert aus fib-dash).
 *
 * Jeder aktive Officer mit Discord-Verknüpfung bekommt einen privaten Text-Channel,
 * in dem nur er selbst, die Analysten-Rolle und der Bot Videos hochladen/lesen.
 *
 * Discord erlaubt höchstens 50 Channels pro Kategorie. Das LSPD hat deutlich mehr
 * Officers, deshalb verwaltet der Bot die Kategorien selbst: Die Channels werden in
 * Reihenfolge der Mitarbeiterliste auf so viele Kategorien verteilt wie nötig
 * (je CLIPS_PER_CATEGORY), fehlende Kategorien werden angelegt und leere wieder entfernt.
 */

type Overwrite = { id: string; type: number; allow: string; deny: string }
export type ClipChannel = {
  id: string
  type: number
  name?: string
  topic?: string | null
  parent_id?: string | null
  position?: number
  permission_overwrites?: Overwrite[]
}
export type ClipRequest = <T>(path: string, init?: RequestInit) => Promise<T>
export type ClipOfficer = {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string
  discordId: string | null
  status: string
}

export type ClipSyncInput = {
  request: ClipRequest
  guildId: string
  analystRoleId: string
  /** Basisname der verwalteten Kategorien, z. B. „Clips“ → „Clips 1“, „Clips 2“ … */
  categoryName: string
  /** Alle Officers (auch gekündigte) in Reihenfolge der Mitarbeiterliste. */
  officers: ClipOfficer[]
  /** Discord-IDs der Server-Mitglieder; null, wenn unbekannt (dann gelten alle als Mitglied). */
  memberIds: Set<string> | null
  /** Bisher vom Bot verwaltete Kategorien (in Reihenfolge). */
  categoryIds: string[]
  saveCategoryIds: (ids: string[]) => Promise<void>
}

export const CLIP_TOPIC_PREFIX = 'lspd-officer-clips:'
/** Discord-Limit ist 50; der Puffer erlaubt Verschiebungen zwischen vollen Kategorien. */
export const CLIPS_PER_CATEGORY = 45
const DISCORD_CATEGORY_LIMIT = 50
const TEXT = 0
const CATEGORY = 4

const VIEW = BigInt(1024)
// Ansehen, Nachrichten senden, Links einbetten, Dateien anhängen, Verlauf lesen
const ACCESS = (VIEW | BigInt(2048) | BigInt(16384) | BigInt(32768) | BigInt(65536)).toString()

let pending: Promise<unknown> = Promise.resolve()

/** Serialisiert Läufe, damit sich überlappende Syncs keine Duplikate erzeugen. */
export function syncOfficerClipChannels(input: ClipSyncInput) {
  const result = pending.catch(() => undefined).then(() => reconcile(input))
  pending = result
  return result
}

export function clipCategoryName(base: string, index: number) {
  return `${base.trim() || 'Clips'} ${index + 1}`.slice(0, 100)
}

export function clipChannelName(officer: Pick<ClipOfficer, 'badgeNumber' | 'lastName'>) {
  const clean = (value: string) => value.toLowerCase().trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')
  const badge = clean(officer.badgeNumber)
  const name = clean(officer.lastName) || 'officer'
  return `🎥│${[badge, name].filter(Boolean).join('-').slice(0, 80)}-clips`
}

const normalizeOverwrites = (items: Overwrite[]) =>
  JSON.stringify(items.map(item => `${item.type}:${item.id}:${item.allow}:${item.deny}`).sort())

/**
 * Neue Positionen, damit die Clips-Channels einer Kategorie in derselben Reihenfolge
 * stehen wie die Mitarbeiterliste. Leer, wenn alles passt. Andere Channels der
 * Kategorie werden nicht angefasst; die Clips-Channels tauschen nur ihre Plätze.
 */
export function clipChannelPositions(channels: ClipChannel[], categoryId: string, orderedOfficerIds: string[]) {
  const byPosition = (a: ClipChannel, b: ClipChannel) =>
    (a.position ?? 0) - (b.position ?? 0) || a.id.length - b.id.length || a.id.localeCompare(b.id)
  const current = channels
    .filter(channel => channel.type === TEXT && channel.parent_id === categoryId && channel.topic?.startsWith(CLIP_TOPIC_PREFIX))
    .sort(byPosition)
  const rosterIndex = new Map(orderedOfficerIds.map((id, index) => [id, index]))
  const rank = (channel: ClipChannel) => rosterIndex.get(channel.topic!.slice(CLIP_TOPIC_PREFIX.length)) ?? Number.MAX_SAFE_INTEGER
  const desired = current
    .map((channel, index) => ({ channel, index }))
    .sort((a, b) => rank(a.channel) - rank(b.channel) || a.index - b.index)
    .map(({ channel }) => channel)
  if (desired.every((channel, index) => channel.id === current[index].id)) return []

  const slots: number[] = []
  for (const channel of current) slots.push(Math.max(channel.position ?? 0, (slots.at(-1) ?? -1) + 1))
  return desired
    .map((channel, index) => ({ id: channel.id, position: slots[index] }))
    .filter(({ id, position }) => channels.find(channel => channel.id === id)?.position !== position)
}

async function reconcile(input: ClipSyncInput) {
  const { request, guildId, analystRoleId, officers, memberIds } = input
  let channels = await request<ClipChannel[]>(`/guilds/${guildId}/channels`)
  const officerById = new Map(officers.map(officer => [officer.id, officer]))
  const clipChannels = channels.filter(channel => channel.type === TEXT && channel.topic?.startsWith(CLIP_TOPIC_PREFIX))
  const officerIdOf = (channel: ClipChannel) => channel.topic!.slice(CLIP_TOPIC_PREFIX.length)

  // 1) Gekündigte (und gelöschte) Officers: Channel samt Videos entfernen.
  //    Funktioniert auch ohne konfigurierte Rolle. Ohne Officer-Daten wird nichts gelöscht.
  const removed = new Set<string>()
  if (officers.length > 0) {
    for (const channel of clipChannels) {
      const officer = officerById.get(officerIdOf(channel))
      if (officer && officer.status !== 'TERMINATED') continue
      await request(`/channels/${channel.id}`, { method: 'DELETE' })
      removed.add(channel.id)
    }
  }
  if (removed.size) channels = channels.filter(channel => !removed.has(channel.id))

  if (!analystRoleId) return
  if (analystRoleId === guildId) throw new Error('Die Clips-Analysten-Rolle darf nicht @everyone sein.')
  const roles = await request<{ id: string }[]>(`/guilds/${guildId}/roles`)
  if (!roles.some(role => role.id === analystRoleId)) throw new Error('Die konfigurierte Clips-Analysten-Rolle existiert nicht.')
  const bot = await request<{ id: string }>('/users/@me')

  // 2) Wer bekommt einen Channel? Aktive Officers auf dem Server – und alle, die schon einen haben
  //    (Discord-Verknüpfung entfernt → Channel bleibt mit den Clips erhalten, nur der Zugriff fällt weg).
  const existingByOfficer = new Map<string, ClipChannel>()
  for (const channel of channels) {
    if (channel.type !== TEXT || !channel.topic?.startsWith(CLIP_TOPIC_PREFIX)) continue
    const id = officerIdOf(channel)
    if (!existingByOfficer.has(id)) existingByOfficer.set(id, channel)
  }
  const hasAccess = (officer: ClipOfficer) =>
    !!officer.discordId && (memberIds === null || memberIds.has(officer.discordId))
  const wanted = officers.filter(officer => officer.status !== 'TERMINATED' && (hasAccess(officer) || existingByOfficer.has(officer.id)))
  const needed = Math.ceil(wanted.length / CLIPS_PER_CATEGORY)

  // 3) Genug Kategorien sicherstellen.
  const baseOverwrites: Overwrite[] = [
    { id: guildId, type: 0, allow: '0', deny: VIEW.toString() },
    { id: analystRoleId, type: 0, allow: ACCESS, deny: '0' },
    { id: bot.id, type: 1, allow: ACCESS, deny: '0' },
  ]
  const categories: ClipChannel[] = []
  for (const id of input.categoryIds) {
    const category = channels.find(channel => channel.id === id && channel.type === CATEGORY)
    if (category && !categories.includes(category)) categories.push(category)
  }
  while (categories.length < needed) {
    const created = await request<ClipChannel>(`/guilds/${guildId}/channels`, {
      method: 'POST',
      body: JSON.stringify({
        name: clipCategoryName(input.categoryName, categories.length),
        type: CATEGORY,
        permission_overwrites: baseOverwrites,
      }),
    })
    channels.push(created)
    categories.push(created)
  }
  await saveIfChanged(input, categories.map(category => category.id))
  for (const [index, category] of categories.entries()) {
    const name = clipCategoryName(input.categoryName, index)
    if (category.name !== name || normalizeOverwrites(category.permission_overwrites ?? []) !== normalizeOverwrites(baseOverwrites)) {
      await request(`/channels/${category.id}`, { method: 'PATCH', body: JSON.stringify({ name, permission_overwrites: baseOverwrites }) })
      category.name = name
    }
  }

  // 4) Channels anlegen, aktualisieren und auf die Kategorien verteilen.
  const childCount = new Map<string, number>()
  for (const channel of channels) {
    if (channel.parent_id) childCount.set(channel.parent_id, (childCount.get(channel.parent_id) ?? 0) + 1)
  }
  const moves: { channel: ClipChannel; payload: Record<string, unknown> }[] = []
  const creates: Record<string, unknown>[] = []

  for (const [index, officer] of wanted.entries()) {
    const parent = categories[Math.floor(index / CLIPS_PER_CATEGORY)]
    const overwrites = [...baseOverwrites]
    if (hasAccess(officer) && officer.discordId !== bot.id) {
      overwrites.push({ id: officer.discordId!, type: 1, allow: ACCESS, deny: '0' })
    }
    const payload = {
      name: clipChannelName(officer),
      topic: `${CLIP_TOPIC_PREFIX}${officer.id}`,
      parent_id: parent.id,
      permission_overwrites: overwrites,
    }
    const existing = existingByOfficer.get(officer.id)
    if (!existing) {
      creates.push({ ...payload, type: TEXT })
    } else if (existing.parent_id !== parent.id) {
      moves.push({ channel: existing, payload })
    } else if (existing.name !== payload.name || normalizeOverwrites(existing.permission_overwrites ?? []) !== normalizeOverwrites(overwrites)) {
      await request(`/channels/${existing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    }
  }

  // Verschiebungen nur in Kategorien mit freiem Platz; jede Verschiebung schafft woanders Platz.
  while (moves.length) {
    const index = moves.findIndex(({ payload }) => (childCount.get(payload.parent_id as string) ?? 0) < DISCORD_CATEGORY_LIMIT)
    if (index === -1) throw new Error('Clips-Channels konnten nicht verteilt werden: alle Ziel-Kategorien sind voll.')
    const [{ channel, payload }] = moves.splice(index, 1)
    await request(`/channels/${channel.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    if (channel.parent_id) childCount.set(channel.parent_id, (childCount.get(channel.parent_id) ?? 1) - 1)
    childCount.set(payload.parent_id as string, (childCount.get(payload.parent_id as string) ?? 0) + 1)
    channel.parent_id = payload.parent_id as string
  }

  for (const payload of creates) {
    const parentId = payload.parent_id as string
    if ((childCount.get(parentId) ?? 0) >= DISCORD_CATEGORY_LIMIT) {
      throw new Error('Eine Clips-Kategorie ist voll (maximal 50 Channels). Bitte fremde Channels aus den Clips-Kategorien entfernen.')
    }
    await request(`/guilds/${guildId}/channels`, { method: 'POST', body: JSON.stringify(payload) })
    childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1)
  }

  // 5) Reihenfolge wie in der Mitarbeiterliste.
  if (wanted.length) {
    const fresh = await request<ClipChannel[]>(`/guilds/${guildId}/channels`)
    const order = wanted.map(officer => officer.id)
    for (const category of categories.slice(0, needed)) {
      const positions = clipChannelPositions(fresh, category.id, order)
      if (positions.length) await request(`/guilds/${guildId}/channels`, { method: 'PATCH', body: JSON.stringify(positions) })
    }
  }

  // 6) Überzählige, leere Kategorien wieder entfernen.
  const keep = categories.slice(0, needed)
  for (const category of categories.slice(needed)) {
    if ((childCount.get(category.id) ?? 0) > 0) {
      keep.push(category)
      continue
    }
    await request(`/channels/${category.id}`, { method: 'DELETE' })
  }
  await saveIfChanged(input, keep.map(category => category.id))
}

async function saveIfChanged(input: ClipSyncInput, ids: string[]) {
  if (ids.length === input.categoryIds.length && ids.every((id, index) => id === input.categoryIds[index])) return
  await input.saveCategoryIds(ids)
  input.categoryIds = ids
}
