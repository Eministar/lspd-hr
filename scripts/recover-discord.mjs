import { mkdir, readFile, writeFile, appendFile, rename, statfs, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { config } from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function nicknameEvidence(nick) {
  const match = (nick || '').match(/^(?:\[\/\]\s*)?(?:\[X\]\s*)?\[([^\]]*\d[^\]]*)\]\s+(.+)$/u)
  return match ? { displayedBadge: match[1], displayName: match[2], promotionBlockedMarker: nick.includes('[X]'), suspendedMarker: nick.includes('[/]'), possiblyTruncated: nick.length >= 32 } : null
}
export function messageText(message) {
  const parts = [message.content || '']
  for (const embed of message.embeds || []) {
    parts.push(embed.title || '', embed.description || '', ...(embed.fields || []).map(f => `${f.name}: ${f.value}`))
  }
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (typeof value.content === 'string') parts.push(value.content)
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === 'object') visit(child)
    }
  }
  visit(message.components)
  return parts.filter(Boolean).join('\n')
}
export async function requestJson(route, token, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 8; attempt++) {
    let response
    try {
      response = await fetcher(`https://discord.com/api/v10${route}`, { headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(30000) })
    } catch {
      if (attempt === 7) throw Object.assign(new Error('Netzwerk/Timeout'), { code: 'NETWORK' })
      await sleep(1000 * (attempt + 1)); continue
    }
    if (response.status === 429) {
      const body = await response.json()
      await sleep(Math.max(1000, Number(body.retry_after || 1) * 1000)); continue
    }
    if (response.status >= 500) { await sleep(1000 * (attempt + 1)); continue }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw Object.assign(new Error(`HTTP ${response.status}; Discord ${body.code || 'unknown'}`), { code: body.code || response.status })
    }
    const data = await response.json()
    if (response.headers.get('x-ratelimit-remaining') === '0') await sleep(Math.max(100, Number(response.headers.get('x-ratelimit-reset-after') || 1) * 1000))
    return data
  }
  throw Object.assign(new Error('Wiederholungsgrenze erreicht'), { code: 'RETRY_EXHAUSTED' })
}

async function main() {
  const { values } = parseArgs({ options: { guild: { type: 'string' }, out: { type: 'string' }, help: { type: 'boolean' }, 'skip-attachments': { type: 'boolean' } } })
  if (values.help) {
    console.log('npm run discord:recover -- [--guild ID] [--out DIRECTORY] [--skip-attachments]\nNur lesend; ohne Datenbank. .env.local/.env: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID (auch LSPD_-Varianten).')
    return
  }
  config({ path: path.join(root, '.env.local'), quiet: true })
  config({ path: path.join(root, '.env'), quiet: true })
  const token = process.env.DISCORD_BOT_TOKEN || process.env.LSPD_DISCORD_BOT_TOKEN
  const guild = values.guild || process.env.DISCORD_GUILD_ID || process.env.LSPD_DISCORD_GUILD_ID
  if (!token || !/^\d{17,20}$/.test(guild || '')) throw new Error('DISCORD_BOT_TOKEN und gültige DISCORD_GUILD_ID erforderlich.')
  const out = path.resolve(values.out || path.join(root, '.backup', 'discord-recovery', new Date().toISOString().replace(/[:.]/g, '-')))
  await mkdir(out, { recursive: true })
  // Exclusive marker prevents mixing different runs or overwriting evidence.
  await writeFile(path.join(out, 'run.json'), JSON.stringify({ guild, startedAt: new Date().toISOString() }), { flag: 'wx' })
  await mkdir(path.join(out, 'messages'), { recursive: true })
  await mkdir(path.join(out, 'attachments'), { recursive: true })
  const issues = [], saved = {}, coverage = []
  const json = (name, data) => writeFile(path.join(out, name), JSON.stringify(data, null, 2))
  const line = (name, data) => appendFile(path.join(out, name), JSON.stringify(data) + '\n')
  const issue = async (code, source, detail) => { const item = { code, source, detail }; issues.push(item); await line('issues.jsonl', item) }
  async function get(route) {
    try { return await requestJson(route, token.trim()) }
    catch (error) { await issue('DISCORD_READ_FAILED', route, `${error.message} (${error.code})`); return null }
  }
  async function snapshot(name, route) {
    const data = await get(route)
    if (data !== null) { await json(`${name}.json`, data); saved[name] = Array.isArray(data) ? data.length : 1 }
    return data
  }
  try {
    const bot = await snapshot('bot', '/users/@me')
    if (!bot) throw new Error('Bot-Authentifizierung fehlgeschlagen; siehe issues.jsonl.')
    const application = await snapshot('application', '/oauth2/applications/@me')
    if (!application || !(BigInt(application.flags || 0) & ((1n << 18n) | (1n << 19n)))) await issue('MESSAGE_CONTENT_UNVERIFIED', 'application', 'Message Content Intent nicht bestätigt; leere Inhalte können unvollständig sein.')
    await snapshot('guild', `/guilds/${guild}?with_counts=true`)
    const roles = await snapshot('roles', `/guilds/${guild}/roles`) || []
    const channels = await snapshot('channels', `/guilds/${guild}/channels`) || []
    const members = []
    let after = '0'
    while (true) {
      const page = await get(`/guilds/${guild}/members?limit=1000&after=${after}`)
      if (!page) break
      for (const member of page) { members.push(member); await line('members.jsonl', member) }
      if (page.length < 1000) { saved.membersComplete = true; break }
      const next = page.at(-1).user.id
      if (next === after) { await issue('PAGINATION_STALLED', 'members', next); break }
      after = next
    }
    saved.members = members.length
    const seed = await readFile(path.join(root, 'prisma/seed.ts'), 'utf8')
    const rankNames = [...seed.matchAll(/\{ name: '([^']+)', sortOrder:/g)].map(m => m[1])
    const trainingNames = [...seed.matchAll(/\{ key: '([^']+)', label: '([^']+)', sortOrder:/g)].map(m => ({ key: m[1], label: m[2] }))
    const officers = members.filter(m => !m.user.bot).map(m => {
      const assigned = roles.filter(r => m.roles.includes(r.id))
      return { discordId: m.user.id, nickname: m.nick, identityCandidate: nicknameEvidence(m.nick), roles: assigned,
        rankCandidates: assigned.filter(r => rankNames.some(n => n.toLowerCase() === r.name.toLowerCase())),
        trainingCandidates: assigned.flatMap(r => trainingNames.filter(t => t.label.toLowerCase() === r.name.toLowerCase()).map(t => ({ ...t, roleId: r.id }))),
        source: `members.jsonl:${m.user.id}`, requiresReview: true }
    })
    await json('officer-candidates.json', officers)
    saved.officerCandidates = officers.filter(o => o.identityCandidate).length
    await json('clip-channels.json', channels.filter(c => c.topic?.startsWith('lspd-officer-clips:')).map(c => ({
      oldOfficerId: c.topic.slice('lspd-officer-clips:'.length), channelId: c.id, channelName: c.name, categoryId: c.parent_id,
      possibleDiscordIds: (c.permission_overwrites || []).filter(o => o.type === 1 && o.id !== bot.id && (BigInt(o.allow) & 1024n)).map(o => o.id),
      source: `channels.json:${c.id}`, requiresReview: true,
    })))
    saved.clipChannels = channels.filter(c => c.topic?.startsWith('lspd-officer-clips:')).length
    const allChannels = new Map(channels.map(c => [c.id, c]))
    const active = await snapshot('active-threads', `/guilds/${guild}/threads/active`)
    for (const thread of active?.threads || []) allChannels.set(thread.id, thread)
    for (const channel of channels.filter(c => [0, 5, 15, 16].includes(c.type))) {
      console.log(`Erfasse archivierte Threads in ${channel.id} …`)
      const kinds = channel.type === 0 ? ['public', 'private', 'joined'] : ['public']
      for (const kind of kinds) {
        let before = ''
        while (true) {
          const endpoint = kind === 'joined' ? 'users/@me/threads/archived/private' : `threads/archived/${kind}`
          const page = await get(`/channels/${channel.id}/${endpoint}?limit=100${before ? `&before=${encodeURIComponent(before)}` : ''}`)
          if (!page) break
          for (const thread of page.threads) { allChannels.set(thread.id, thread); await line('archived-threads.jsonl', thread) }
          if (!page.has_more) break
          const last = page.threads.at(-1)
          const next = kind === 'joined' ? last?.id : last?.thread_metadata.archive_timestamp
          if (!next || next === before) { await issue('PAGINATION_STALLED', channel.id, kind); break }
          before = next
        }
      }
    }
    for (const channel of allChannels.values()) {
      if (![0, 2, 5, 10, 11, 12, 13].includes(channel.type)) continue
      console.log(`Sichere Channel ${channel.id} …`)
      let before = '', count = 0, complete = false
      while (true) {
        const page = await get(`/channels/${channel.id}/messages?limit=100${before ? `&before=${before}` : ''}`)
        if (!page) break
        for (const message of page) {
          await line(`messages/${channel.id}.jsonl`, message)
          count++
          const text = messageText(message)
          if (text) await line('message-evidence.jsonl', { channelId: channel.id, messageId: message.id, timestamp: message.timestamp, authorId: message.author?.id, webhookId: message.webhook_id, url: `https://discord.com/channels/${guild}/${channel.id}/${message.id}`, text })
          for (const attachment of message.attachments || []) {
            const record = { channelId: channel.id, messageId: message.id, ...attachment, localPath: null }
            if (!values['skip-attachments']) {
              try {
                const url = new URL(attachment.url)
                if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) throw new Error('Nicht unterstützter Attachment-Host')
                const filename = `${message.id}-${attachment.id}-${path.basename(attachment.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)}`
                const destination = path.join(out, 'attachments', filename)
                const disk = await statfs(out)
                if (disk.bavail * disk.bsize < Number(attachment.size || 0) + 1024 ** 3) throw new Error('DISK_RESERVE: Weniger als 1 GiB Reserve nach diesem Download; Metadaten bleiben erhalten')
                const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(600000) })
                if (!response.ok || !response.body) throw new Error(`Download HTTP ${response.status}`)
                await pipeline(Readable.fromWeb(response.body), createWriteStream(destination + '.partial'))
                await rename(destination + '.partial', destination)
                record.localPath = `attachments/${filename}`
                record.downloadedBytes = (await stat(destination)).size
                record.downloadedContentType = response.headers.get('content-type')
                if (record.downloadedBytes !== attachment.size) await issue('ATTACHMENT_SIZE_VARIANT', `${channel.id}/${message.id}/${attachment.id}`, `Discord-Metadaten: ${attachment.size} Bytes; CDN-Datei: ${record.downloadedBytes} Bytes. Gelieferte Datei gespeichert; Format/Integrität prüfen.`)
                saved.attachments = (saved.attachments || 0) + 1
              } catch (error) { await issue('ATTACHMENT_FAILED', `${channel.id}/${message.id}/${attachment.id}`, error.message) }
            } else await issue('ATTACHMENT_SKIPPED', attachment.id, 'Nur Metadaten/URL gespeichert')
            await line('attachments.jsonl', record)
          }
        }
        if (page.length < 100) { complete = true; break }
        const next = page.at(-1).id
        if (next === before) { await issue('PAGINATION_STALLED', channel.id, next); break }
        before = next
      }
      saved.messages = (saved.messages || 0) + count
      coverage.push({ channelId: channel.id, count, paginationComplete: complete })
      await json('channel-coverage.json', coverage)
    }
    await snapshot('scheduled-events', `/guilds/${guild}/scheduled-events?with_user_count=true`)
    let auditBefore = ''
    while (true) {
      const page = await get(`/guilds/${guild}/audit-logs?limit=100${auditBefore ? `&before=${auditBefore}` : ''}`)
      if (!page) break
      await line('audit-log-pages.jsonl', page)
      if (page.audit_log_entries.length < 100) break
      const next = page.audit_log_entries.at(-1).id
      if (next === auditBefore) break
      auditBefore = next
    }
    await issue('ROLE_MAPPING_REVIEW', 'officer-candidates.json', 'Namensgleichheit mit Seed ist nur ein Vorschlag. Individuelle Ränge, Ausbildungen, Units, Ebenen und Gruppen bleiben als rohe Rollen erhalten. Fehlende Rolle beweist keine fehlende Ausbildung.')
    await issue('IDENTITY_REVIEW', 'officer-candidates.json', 'Nickname kann gekürzt, veraltet oder manuell geändert sein. Präfix, Vor-/Nachname und doppelte Dienstnummern vor Import prüfen. Discord-Beitritt ist kein Einstellungsdatum.')
    await issue('HISTORY_NOT_COMPLETE', 'Discord', 'Gelöschte Nachrichten/Channels, frühere Mitglieder, nicht zugängliche private Threads, DMs, abgelaufene Audit-Historie und externe Clip-Dateien können fehlen. Externe Links sind nur als Nachricht gesichert.')
    const schema = await readFile(path.join(root, 'prisma/schema.prisma'), 'utf8')
    await json('model-coverage.json', [...schema.matchAll(/^model (\w+) \{/gm)].map(m => ({ model: m[1], status: 'NOT_RESTORED', code: 'DB_RECORDS_NOT_RECONSTRUCTED', detail: 'Discord-Belege gesichert, soweit verfügbar; keine vollständigen relationalen DB-Datensätze oder internen IDs garantiert.' })))
    await issue('DB_ONLY_DATA', 'prisma/schema.prisma', 'Passwort-Hashes, API-Geheimnisse, interne Rechte/Settings, nicht gepostete Akten/Notizen, vollständige Prüfungen, Verträge, Zeitbuchungen und historische Relationen sind aus Discord nicht verlässlich rekonstruierbar. Details pro Modell: model-coverage.json.')
    const { analyzeRecovery } = await import('./analyze-discord-recovery.mjs')
    const analysis = await analyzeRecovery(out)
    saved.hrEvidence = analysis.counts
  } catch (error) {
    await issue('RUN_FAILED', 'run', error.message)
    process.exitCode = 1
  } finally {
    await json('report.json', { finishedAt: new Date().toISOString(), guild, saved, coverage, issues })
    await writeFile(path.join(out, 'REPORT.md'), `# Discord-Datensicherung\n\n## Gesichert (tatsächliche Zähler)\n\n${Object.entries(saved).map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`).join('\n')}\n\nRohdaten sind Discord-Snapshots, keine garantierte DB-Wiederherstellung. Kandidaten und Nachrichtenbelege benötigen Prüfung. paginationComplete bedeutet nur, dass die API-Paginierung beendet wurde; ausgeblendete Inhalte bleiben möglich.\n\n## Nicht gesichert / eingeschränkt / zu prüfen\n\n${issues.map(i => `- **${i.code}** — ${i.source}: ${i.detail}`).join('\n')}\n`)
    console.log(`Sicherung: ${out}\nBericht: ${path.join(out, 'REPORT.md')}`)
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
