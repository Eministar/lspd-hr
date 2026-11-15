import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { config } from 'dotenv'
import { PrismaClient, Prisma } from '../src/generated/prisma/client.js'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { classifyEvidence } from './analyze-discord-recovery.mjs'
import { nicknameEvidence } from './recover-discord.mjs'

const clean = s => String(s || '').replace(/[*`]/g, '').trim()
const norm = s => clean(s).replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')
const identityKey = s => norm(s).replace(/^(?:(?:prof\.|dr\.|iur\.|med\.)\s*)+/i, '')
const badge = s => clean(s).replace(/^\[|\]$/g, '').split('__terminated__')[0]
const roleIds = s => [...String(s || '').matchAll(/<@&(\d+)>/g)].map(m => m[1])
export function berlinDate(value) {
  const timestamp = value?.match(/<t:(\d+)/)
  if (timestamp) return new Date(Number(timestamp[1]) * 1000).toISOString()
  const m = clean(value).match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4}),?\s+(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const year = Number(m[3]) + (m[3].length === 2 ? 2000 : 0)
  const utc = Date.UTC(year, Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]))
  let result = utc
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(result)).map(p => [p.type, p.value]))
    const displayed = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
    result += utc - displayed
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(result)).map(p => [p.type, p.value]))
  if (+parts.day !== +m[1] || +parts.month !== +m[2] || +parts.hour !== +m[4] || +parts.minute !== +m[5]) return null
  return new Date(result).toISOString()
}

export function buildPlan(base, members, clips, messages, botId, now = new Date(), auditEntries = []) {
  const data = structuredClone(base.data)
  const settings = Object.fromEntries(data.SystemSetting.map(s => [s.key, s.value]))
  const ranks = new Map(data.Rank.map(r => [r.id, r]))
  const rankByRole = new Map(Object.entries(JSON.parse(settings['discord.rankRoleMap'] || '{}')).filter(([id]) => ranks.has(id)).map(([id, role]) => [role, id]))
  const trainingByRole = new Map(Object.entries(JSON.parse(settings['discord.trainingRoleMap'] || '{}')).filter(([id]) => data.Training.some(t => t.id === id)).map(([id, role]) => [role, id]))
  const unitRoleMap = JSON.parse(settings['discord.unitRoleMap'] || '{}')
  const unitByRole = new Map(data.Unit.flatMap(u => (u.discordRoleId || unitRoleMap[u.key]) ? [[u.discordRoleId || unitRoleMap[u.key], u.key]] : []))
  const officers = new Map(data.Officer.map(o => [o.id, o]))
  const changed = new Set(), created = new Set(), notes = [], promotions = [], terminations = [], sanctions = [], issues = [], sources = {}
  const absences = new Map(data.AbsenceNotice.map(a => [a.id, a]))
  const changedAbsences = new Set()
  const trainings = new Map(data.OfficerTraining.map(t => [`${t.officerId}:${t.trainingId}`, t]))
  const changedTrainings = new Set()
  const mark = (o, source) => { changed.add(o.id); (sources[o.id] ||= []).push(source) }
  const issue = (code, source, detail) => issues.push({ code, source, detail })
  const current = members.filter(m => !m.user.bot).map(m => ({ ...m, identity: nicknameEvidence(m.nick) }))
  const aliases = new Map()
  const addAlias = (name, discordId) => {
    const key = identityKey(name)
    if (!key) return
    if (!aliases.has(key)) aliases.set(key, new Set())
    aliases.get(key).add(discordId)
  }
  for (const member of current) if (member.identity) addAlias(member.identity.displayName, member.user.id)
  for (const entry of auditEntries) for (const change of entry.changes || []) if (change.key === 'nick') {
    for (const nick of [change.old_value, change.new_value]) {
      const identity = nicknameEvidence(nick)
      if (identity && !identity.possiblyTruncated) addAlias(identity.displayName, entry.target_id)
    }
  }
  const subjectDiscordId = name => {
    const exact = current.filter(m => m.identity && !m.identity.possiblyTruncated && identityKey(m.identity.displayName) === identityKey(name))
    if (exact.length === 1) return exact[0].user.id
    return aliases.get(identityKey(name))?.size === 1 ? [...aliases.get(identityKey(name))][0] : null
  }
  const fullName = o => `${o.firstName} ${o.lastName}`
  const rankNamed = value => data.Rank.find(r => norm(r.name) === norm(value))?.id
  const latestHire = new Map()
  const sorted = messages.filter(m => m.author?.id === botId && m.timestamp > base.meta.exportedAt)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
  for (const message of sorted) {
    const e = classifyEvidence(message)
    const heading = e.text.split('\n')[0]
    const subject = heading.includes(' · ') ? heading.slice(heading.indexOf(' · ') + 3).trim() : ''
    const fields = Object.fromEntries(e.fields.map(f => [f.label, f.value]))
    const eventBadge = badge(fields.Dienstnummer)
    const eventRank = rankByRole.get(roleIds(fields.Rang)[0]) || rankNamed(fields.Rang)
    const source = `https://discord.com/channels/${settings['discord.guildId']}/${message.channel_id}/${message.id}`
    const time = new Date(message.timestamp).toISOString()
    const actorDiscordId = e.text.match(/Mit freundlichen Grüßen\s*\n<@(\d+)>/)?.[1] || null
    const actor = data.User.find(u => u.discordId === actorDiscordId)?.id || null
    let matches = [...officers.values()].filter(o => norm(fullName(o)) === norm(subject))
    const active = matches.filter(o => o.status !== 'TERMINATED')
    if (active.length === 1) matches = active
    else if (matches.length > 1) matches = matches.filter(o => badge(o.badgeNumber) === eventBadge)
    let officer = matches.length === 1 ? matches[0] : null
    const subjectId = subjectDiscordId(subject)
    if (!officer && subjectId) {
      const clipIds = clips.filter(c => c.possibleDiscordIds.length === 1 && c.possibleDiscordIds[0] === subjectId).map(c => c.oldOfficerId)
      const linked = [...officers.values()].filter(o => clipIds.includes(o.id) || o.discordId === subjectId)
      const preferred = linked.filter(o => clipIds.includes(o.id))
      if (preferred.length === 1) officer = preferred[0]
      else if (linked.length === 1) officer = linked[0]
    }
    if (/Neueinstellung/.test(heading) && subject && eventRank && eventBadge) {
      const hireDate = berlinDate(fields.Eintrittsdatum)
      if (!hireDate) { issue('HIRE_DATE_MISSING', source, subject); continue }
      const confirmedClip = subjectId ? clips.filter(c => c.possibleDiscordIds.length === 1 && c.possibleDiscordIds[0] === subjectId) : []
      if (confirmedClip.length === 1 && officers.has(confirmedClip[0].oldOfficerId)) {
        officer = officers.get(confirmedClip[0].oldOfficerId)
        officer.status = 'ACTIVE'
      }
      if (!officer || officer.status === 'TERMINATED') {
        const memberMatches = current.filter(m => m.user.id === subjectId)
        const member = memberMatches.length === 1 ? memberMatches[0] : null
        let clipMatches = member ? clips.filter(c => c.possibleDiscordIds.length === 1 && c.possibleDiscordIds[0] === member.user.id) : []
        if (!clipMatches.length) {
          const slug = s => s.toLowerCase().trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')
          const expected = `🎥│${slug(eventBadge)}-${slug(subject.split(/\s+/).at(-1))}-clips`
          clipMatches = clips.filter(c => c.channelName === expected && !officers.has(c.oldOfficerId))
          if (clipMatches.length === 1) issue('CLIP_ID_FROM_BADGE_AND_NAME', source, clipMatches[0].oldOfficerId)
        }
        const clipId = clipMatches.length === 1 ? clipMatches[0].oldOfficerId : null
        const id = clipId && !officers.has(clipId) ? clipId : `discord_hire_${message.id}`
        const words = subject.split(/\s+/)
        if (words.length < 2) { issue('NAME_INCOMPLETE', source, subject); continue }
        officer = { id, firstName: words.slice(0, -1).join(' '), lastName: words.at(-1), badgeNumber: eventBadge, discordId: null, rankId: eventRank, status: 'ACTIVE', unit: null, units: [], flag: null, promotionBlocked: false, suspendedUntil: null, suspensionReason: null, notes: null, hireDate, lastOnline: null, createdAt: time, updatedAt: time }
        officers.set(id, officer); created.add(id)
      } else { officer.hireDate = hireDate; officer.status = 'ACTIVE' }
      if (subjectId) {
        const conflicts = [...officers.values()].filter(o => o.id !== officer.id && o.discordId === subjectId)
        if (conflicts.every(o => o.status === 'TERMINATED')) {
          for (const prior of conflicts) { prior.discordId = null; mark(prior, source) }
          officer.discordId = subjectId
        } else issue('HIRE_DISCORD_CONFLICT', source, subjectId)
      }
      officer.rankId = eventRank; officer.badgeNumber = eventBadge
      latestHire.set(officer.id, time); mark(officer, source)
    }
    // Every HR event remains available in the application, including unresolved identities.
    notes.push({ id: `discord_evidence_${message.id}`, officerId: officer?.id || null, authorId: actor, title: `[Discord-Rettung] ${heading.replace(/^#\s*/, '')}`.slice(0, 190), content: `${source}\n\n${e.text}`, pinned: false, createdAt: time, updatedAt: time })
    if (!officer) { issue('EVENT_IDENTITY_UNRESOLVED', source, subject || heading); continue }
    if (/Dienstverhältnis beendet/.test(heading)) {
      terminations.push({ id: `discord_termination_${message.id}`, officerId: officer.id, reason: clean(fields.Grund) || 'Siehe Discord-Beleg', terminatedByUserId: actor, terminatedAt: time, previousRank: ranks.get(eventRank || officer.rankId)?.name, previousBadgeNumber: eventBadge || badge(officer.badgeNumber), previousFirstName: officer.firstName, previousLastName: officer.lastName })
      officer.status = 'TERMINATED'; officer.badgeNumber = `${eventBadge || badge(officer.badgeNumber)}__terminated__${officer.id}`; mark(officer, source)
    } else if (/Rangänderung|Rang geändert|Beförderung|Degradierung/.test(heading)) {
      const next = rankNamed(fields['Neuer Rang']) || eventRank
      const previous = rankNamed(fields['Alter Rang']) || officer.rankId
      const change = clean(fields['DN-Wechsel']).split('→').map(s => s.trim())
      if (next && previous) {
        promotions.push({ id: `discord_promotion_${message.id}`, officerId: officer.id, oldRankId: previous, newRankId: next, oldBadgeNumber: change.length === 2 ? change[0] : null, newBadgeNumber: change.length === 2 ? change[1] : null, performedByUserId: actor, note: source, createdAt: time })
        officer.rankId = next; officer.badgeNumber = change.length === 2 ? change[1] : eventBadge || officer.badgeNumber; mark(officer, source)
      } else issue('RANK_UNRESOLVED', source, subject)
    } else if (/Ausbildung aktualisiert/.test(heading)) {
      for (const m of e.text.matchAll(/<@&(\d+)>:\s*\*\*(abgeschlossen|nicht abgeschlossen)\*\*/g)) {
        const trainingId = trainingByRole.get(m[1])
        if (!trainingId) { issue('TRAINING_ROLE_UNKNOWN', source, m[1]); continue }
        const key = `${officer.id}:${trainingId}`
        const prior = trainings.get(key)
        trainings.set(key, { id: prior?.id || `discord_training_${officer.id}_${trainingId}`, officerId: officer.id, trainingId, completed: m[2] === 'abgeschlossen', createdAt: prior?.createdAt || time, updatedAt: time })
        changedTrainings.add(key)
      }
    } else if (/Unit-Zuordnung geändert/.test(heading)) {
      const ids = roleIds(fields['Aktuelle Zuordnung'])
      if (ids.length && ids.every(id => unitByRole.has(id))) { officer.units = [...new Set(ids.map(id => unitByRole.get(id)))]; officer.unit = officer.units[0] || null; mark(officer, source) }
      else if (clean(fields['Aktuelle Zuordnung']) === 'keine Unit') { officer.units = []; officer.unit = null; mark(officer, source) }
      else issue('UNIT_MAPPING_UNRESOLVED', source, subject)
    } else if (/Abmeldung beendet/.test(heading)) {
      for (const absence of absences.values()) if (absence.officerId === officer.id && absence.startsAt <= time && absence.endsAt > time) {
        absence.endsAt = time; absence.updatedAt = time; changedAbsences.add(absence.id)
      }
    } else if (/Abmeldung/.test(heading) && fields.Bis) {
      const endsAt = berlinDate(fields.Bis)
      const startsAt = fields.Von ? berlinDate(fields.Von) : time
      if (endsAt && startsAt && endsAt > startsAt) {
        const id = `discord_absence_${message.id}`
        absences.set(id, { id, officerId: officer.id, startsAt, endsAt, reason: clean(fields.Grund) || 'Siehe Discord-Beleg', source: fields.Von ? 'discord-recovery' : 'discord-recovery-start-inferred', actorDiscordId, createdAt: time, updatedAt: time }); changedAbsences.add(id)
        if (!fields.Von) issue('ABSENCE_START_INFERRED', source, 'Beginn aus Erstellungszeit der Abmeldung abgeleitet; im source-Feld markiert.')
      } else issue('ABSENCE_DATE_UNRESOLVED', source, subject)
    } else if (/Sanktion ausgestellt/.test(heading)) {
      const amount = clean(fields.Maßnahme).match(/Geldstrafe:\s*([\d.]+)/)?.[1]
      const status = ({ Offen: 'OPEN', Bezahlt: 'PAID', Eskaliert: 'ESCALATED', 'Vor Gericht': 'IN_COURT' })[clean(fields.Status)]
      const grade = clean(fields.Einstufung).split(' · ')[0]
      if (amount && status && grade) sanctions.push({ id: `discord_sanction_${message.id}`, officerId: officer.id, reason: clean(fields.Grund), penalGrade: grade, measureType: 'FINE', fineAmount: Number(amount.replaceAll('.', '')), status, dueAt: berlinDate(fields.Frist), discordChannelId: message.channel_id, discordMessageId: message.id, issuedByUserId: actor, previousRank: ranks.get(eventRank || officer.rankId)?.name, previousBadgeNumber: eventBadge, previousFirstName: officer.firstName, previousLastName: officer.lastName, createdAt: time, updatedAt: message.edited_timestamp || time })
      else issue('SANCTION_FIELDS_INCOMPLETE', source, subject)
    }
  }
  // Resolve current membership only by an existing Discord link or unique full name.
  for (const member of current) {
    const identity = member.identity
    if (!identity) continue
    const rankIds = [...new Set(member.roles.map(r => rankByRole.get(r)).filter(Boolean))]
    if (!rankIds.length) continue // Bracketed nicknames also occur for other departments.
    const ownClips = clips.filter(c => c.possibleDiscordIds.length === 1 && c.possibleDiscordIds[0] === member.user.id)
    let candidates = ownClips.length === 1 && officers.has(ownClips[0].oldOfficerId) ? [officers.get(ownClips[0].oldOfficerId)] : []
    if (!candidates.length) candidates = [...officers.values()].filter(o => o.status !== 'TERMINATED' && o.discordId === member.user.id)
    if (!candidates.length) candidates = [...officers.values()].filter(o => o.status !== 'TERMINATED' && (identityKey(fullName(o)) === identityKey(identity.displayName) || subjectDiscordId(fullName(o)) === member.user.id))
    if (candidates.length !== 1) { issue('MEMBER_IDENTITY_UNRESOLVED', member.user.id, identity.displayName); continue }
    const officer = candidates[0]
    const conflicting = [...officers.values()].filter(o => o.id !== officer.id && o.discordId === member.user.id)
    if (conflicting.some(o => o.status !== 'TERMINATED')) { issue('DISCORD_ID_CONFLICT', member.user.id, officer.id); continue }
    for (const old of conflicting) { old.discordId = null; mark(old, `discord-link-reassigned:${member.user.id}`) }
    if (rankIds.length !== 1) { issue('MEMBER_RANK_AMBIGUOUS', member.user.id, String(rankIds.length)); continue }
    officer.discordId = member.user.id; officer.rankId = rankIds[0]; officer.badgeNumber = identity.displayedBadge
    if (!identity.possiblyTruncated) {
      const words = identity.displayName.split(/\s+/)
      if (words.length > 1) { officer.firstName = words.slice(0, -1).join(' '); officer.lastName = words.at(-1) }
    }
    if (officer.status === 'TERMINATED' && ownClips.some(c => c.oldOfficerId === officer.id)) {
      officer.status = 'ACTIVE'
      issue('STATUS_FROM_CURRENT_DISCORD', member.user.id, 'Aktueller Rang, Nickname und personengebundener Clip-Channel belegen aktuellen Mitarbeiter; alte Kündigung bleibt historisch erhalten.')
    }
    officer.promotionBlocked = identity.promotionBlockedMarker
    if (identity.suspendedMarker) issue('SUSPENSION_END_UNKNOWN', member.user.id, 'Sperrmarker vorhanden; kein erfundenes Ablaufdatum gesetzt.')
    mark(officer, `members.jsonl:${member.user.id}`)
    for (const role of member.roles) {
      const trainingId = trainingByRole.get(role)
      if (!trainingId) continue
      const key = `${officer.id}:${trainingId}`, prior = trainings.get(key)
      // No completion date is invented: current snapshot is the observation date.
      trainings.set(key, { id: prior?.id || `discord_training_${officer.id}_${trainingId}`, officerId: officer.id, trainingId, completed: true, createdAt: prior?.createdAt || now.toISOString(), updatedAt: now.toISOString() }); changedTrainings.add(key)
    }
  }
  for (const id of changed) {
    const o = officers.get(id)
    if (o.status !== 'TERMINATED') {
      const away = [...absences.values()].some(a => a.officerId === id && a.startsAt <= now.toISOString() && a.endsAt > now.toISOString())
      if (away) o.status = 'AWAY'
      else if (o.status === 'AWAY' || latestHire.has(id)) o.status = 'ACTIVE'
    }
    o.updatedAt = now.toISOString()
  }
  const activeBadges = new Map()
  for (const o of officers.values()) if (o.status !== 'TERMINATED') { const key = badge(o.badgeNumber); (activeBadges.get(key) || activeBadges.set(key, []).get(key)).push(o.id) }
  for (const [key, ids] of activeBadges) if (ids.length > 1) issue('DUPLICATE_ACTIVE_BADGE', key, ids.join(', '))
  return { sourceDate: base.meta.exportedAt, generatedAt: now.toISOString(), officers: [...changed].map(id => officers.get(id)), createdOfficerIds: [...created], trainings: [...changedTrainings].map(k => trainings.get(k)), absences: [...changedAbsences].map(id => absences.get(id)), promotions, terminations, sanctions, notes, issues, sources }
}

async function main() {
  const { values } = parseArgs({ options: { snapshot: { type: 'string' }, recovery: { type: 'string' }, out: { type: 'string' }, apply: { type: 'boolean' } } })
  if (!values.snapshot || !values.recovery || !values.out) throw new Error('--snapshot, --recovery und --out erforderlich')
  config({ quiet: true })
  const base = JSON.parse(await fs.readFile(values.snapshot, 'utf8'))
  const load = async name => JSON.parse(await fs.readFile(path.join(values.recovery, name), 'utf8'))
  const members = (await fs.readFile(path.join(values.recovery, 'members.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  const channels = await load('channels.json')
  const settings = Object.fromEntries(base.data.SystemSetting.map(s => [s.key, s.value]))
  const ids = new Set([settings['discord.announcementsChannelId'], settings['discord.updateChannelId'], settings['discord.sanctionsChannelId'], ...channels.filter(c => /personalinfo|personalankündigungen|sanktionen/.test(c.name)).map(c => c.id)].filter(Boolean))
  const messages = []
  for (const id of ids) {
    try { messages.push(...(await fs.readFile(path.join(values.recovery, 'messages', `${id}.jsonl`), 'utf8')).trim().split('\n').filter(Boolean).map(line => ({ ...JSON.parse(line), channel_id: id }))) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const auditEntries = (await fs.readFile(path.join(values.recovery, 'audit-log-pages.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).flatMap(line => JSON.parse(line).audit_log_entries)
  const plan = buildPlan(base, members, await load('clip-channels.json'), messages, (await load('bot.json')).id, new Date(), auditEntries)
  await fs.mkdir(values.out, { recursive: true })
  await fs.writeFile(path.join(values.out, 'plan.json'), JSON.stringify(plan, null, 2))
  const counts = Object.fromEntries(['officers', 'createdOfficerIds', 'trainings', 'absences', 'promotions', 'terminations', 'sanctions', 'notes'].map(k => [k, plan[k].length]))
  console.log(JSON.stringify({ mode: values.apply ? 'apply' : 'preview', counts, issues: plan.issues.reduce((a, i) => (a[i.code] = (a[i.code] || 0) + 1, a), {}) }))
  if (!values.apply) return
  const db = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) })
  try {
    const before = {}
    await db.$transaction(async tx => {
      for (const model of Prisma.dmmf.datamodel.models) before[model.name] = await tx[model.name[0].toLowerCase() + model.name.slice(1)].findMany()
    }, { isolationLevel: 'RepeatableRead', timeout: 300000 })
    await fs.writeFile(path.join(values.out, `before-discord-${Date.now()}.json`), JSON.stringify({ meta: { exportedAt: new Date().toISOString() }, data: before }, (_, v) => typeof v === 'bigint' ? v.toString() : v))
    const previous = new Map(before.Officer.map(o => [o.id, o]))
    const result = await db.$transaction(async tx => {
      // Release confirmed old Discord links first, preserving unique-key integrity.
      for (const officer of plan.officers.filter(o => o.discordId === null && previous.get(o.id)?.discordId)) {
        const changed = await tx.officer.updateMany({ where: { id: officer.id, updatedAt: previous.get(officer.id).updatedAt }, data: { discordId: null } })
        if (changed.count !== 1) throw new Error(`CONCURRENT_OFFICER_CHANGE:${officer.id}`)
        previous.set(officer.id, await tx.officer.findUniqueOrThrow({ where: { id: officer.id } }))
      }
      for (const officer of plan.officers) {
        const { id, ...fields } = officer
        const baseline = base.data.Officer.find(o => o.id === id)
        // Preserve fields which Discord did not change, including concurrent online/activity data.
        if (baseline) for (const key of Object.keys(fields)) if (key !== 'updatedAt' && JSON.stringify(fields[key]) === JSON.stringify(baseline[key])) delete fields[key]
        if (fields.units === null) fields.units = Prisma.DbNull
        if (previous.has(id)) {
          const changed = await tx.officer.updateMany({ where: { id, updatedAt: previous.get(id).updatedAt }, data: fields })
          if (changed.count !== 1) throw new Error(`CONCURRENT_OFFICER_CHANGE:${id}`)
        } else await tx.officer.create({ data: { id, ...fields } })
      }
      for (const row of plan.trainings) {
        const fields = { ...row }; delete fields.id
        await tx.officerTraining.upsert({ where: { officerId_trainingId: { officerId: row.officerId, trainingId: row.trainingId } }, create: row, update: fields })
      }
      for (const [model, rows] of [['absenceNotice', plan.absences], ['promotionLog', plan.promotions], ['termination', plan.terminations], ['sanction', plan.sanctions], ['note', plan.notes]]) {
        for (const row of rows) {
          const { id, ...fields } = row
          await tx[model].upsert({ where: { id }, create: row, update: fields })
        }
      }
      return { ...counts, committedAt: new Date().toISOString() }
    }, { timeout: 300000, maxWait: 30000 })
    await fs.writeFile(path.join(values.out, 'result.json'), JSON.stringify({ ...result, issues: plan.issues }, null, 2))
    console.log(JSON.stringify({ committed: true, ...result }))
  } finally { await db.$disconnect() }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`Import fehlgeschlagen: ${error.code || error.name}. Details werden nicht mit Zugangsdaten ausgegeben.`); process.exitCode = 1 })
