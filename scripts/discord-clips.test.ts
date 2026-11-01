import test from 'node:test'
import assert from 'node:assert/strict'
import { CLIP_TOPIC_PREFIX, CLIPS_PER_CATEGORY, syncOfficerClipChannels, type ClipChannel, type ClipOfficer } from '../src/lib/discord-clips'

function fixture(count: number) {
  let nextId = 1000
  const channels: ClipChannel[] = []
  const writes: { method: string; path: string; body?: Record<string, unknown> }[] = []
  let categoryIds: string[] = []
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (method === 'GET') {
      if (path.endsWith('/roles')) return [{ id: 'analysts' }] as T
      if (path === '/users/@me') return { id: 'bot' } as T
      return channels.map(channel => ({ ...channel })) as T
    }
    writes.push({ method, path, body })
    if (method === 'DELETE') {
      channels.splice(channels.findIndex(channel => path === `/channels/${channel.id}`), 1)
      return undefined as T
    }
    if (method === 'POST') {
      if (body.parent_id) assert.ok(channels.filter(c => c.parent_id === body.parent_id).length < 50, 'Discord-Limit überschritten')
      const created = { id: String(nextId++), position: channels.length, ...body }
      channels.push(created)
      return created as T
    }
    if (Array.isArray(body)) {
      for (const { id, position } of body) channels.find(c => c.id === id)!.position = position
      return undefined as T
    }
    const target = channels.find(channel => path === `/channels/${channel.id}`)!
    if (body.parent_id && body.parent_id !== target.parent_id) {
      assert.ok(channels.filter(c => c.parent_id === body.parent_id).length < 50, 'Discord-Limit überschritten')
    }
    Object.assign(target, body)
    return target as T
  }
  const officers: ClipOfficer[] = Array.from({ length: count }, (_, i) => ({
    id: `o${i}`, firstName: 'Max', lastName: `Muster${i}`, badgeNumber: String(i + 1), discordId: `${100000000000000000 + i}`, status: 'ACTIVE',
  }))
  const sync = () => syncOfficerClipChannels({
    request, guildId: 'guild', analystRoleId: 'analysts', categoryName: 'Clips', officers, memberIds: null,
    categoryIds, saveCategoryIds: async ids => { categoryIds = ids },
  })
  const clips = () => channels.filter(c => c.type === 0 && c.topic?.startsWith(CLIP_TOPIC_PREFIX))
  const categories = () => channels.filter(c => c.type === 4)
  return { channels, writes, officers, sync, clips, categories, ids: () => categoryIds }
}

test('80 Officers werden auf genug Kategorien verteilt, jede unter dem Discord-Limit', async () => {
  const f = fixture(80)
  await f.sync()
  assert.equal(f.clips().length, 80)
  assert.equal(f.categories().length, Math.ceil(80 / CLIPS_PER_CATEGORY))
  assert.deepEqual(f.categories().map(c => c.name), ['Clips 1', 'Clips 2'])
  assert.deepEqual(f.ids(), f.categories().map(c => c.id))
  for (const category of f.categories()) assert.ok(f.channels.filter(c => c.parent_id === category.id).length <= 50)
  // Reihenfolge der Mitarbeiterliste: o0..o44 in Kategorie 1
  const first = f.categories()[0].id
  assert.ok(f.clips().filter(c => c.parent_id === first).every(c => Number(c.topic!.slice(CLIP_TOPIC_PREFIX.length + 1)) < CLIPS_PER_CATEGORY))
  // Zweiter Lauf ändert nichts
  const before = f.writes.length
  await f.sync()
  assert.equal(f.writes.length, before)
})

test('Wachstum legt weitere Kategorien an, Kündigungen löschen Channels und leere Kategorien', async () => {
  const f = fixture(80)
  await f.sync()
  for (let i = 80; i < 140; i++) f.officers.push({ id: `o${i}`, firstName: 'A', lastName: `B${i}`, badgeNumber: String(i + 1), discordId: `${200000000000000000 + i}`, status: 'ACTIVE' })
  await f.sync()
  assert.equal(f.clips().length, 140)
  assert.equal(f.categories().length, 4)
  for (const officer of f.officers.slice(30)) officer.status = 'TERMINATED'
  await f.sync()
  assert.equal(f.clips().length, 30)
  assert.equal(f.categories().length, 1)
  assert.equal(f.ids().length, 1)
})

test('Beförderung an die Spitze verschiebt Channels über Kategoriegrenzen ohne Limit-Verstoß', async () => {
  const f = fixture(90)
  await f.sync()
  const promoted = f.officers.splice(80, 10)
  f.officers.unshift(...promoted)
  await f.sync()
  const first = f.categories()[0].id
  for (const officer of promoted) assert.equal(f.clips().find(c => c.topic === `${CLIP_TOPIC_PREFIX}${officer.id}`)!.parent_id, first)
  const inFirst = f.clips().filter(c => c.parent_id === first).sort((a, b) => a.position! - b.position!)
  assert.deepEqual(inFirst.slice(0, 10).map(c => c.topic), promoted.map(o => `${CLIP_TOPIC_PREFIX}${o.id}`))
})

test('ohne Analysten-Rolle werden keine Channels angelegt', async () => {
  const f = fixture(5)
  await syncOfficerClipChannels({
    request: async <T>(path: string) => (path.endsWith('/channels') ? [] : []) as T,
    guildId: 'guild', analystRoleId: '', categoryName: 'Clips', officers: f.officers, memberIds: null,
    categoryIds: [], saveCategoryIds: async () => assert.fail('darf nicht speichern'),
  })
})
