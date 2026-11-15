import { readdir, readFile, mkdir, appendFile, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { messageText } from './recover-discord.mjs'

export function classifyEvidence(message, channelName = '') {
  const text = messageText(message)
  const combined = `${channelName}\n${text}`
  const patterns = {
    personalinfo: /personal.?info|personalakte|mitarbeiter|dienstnummer|eintrittsdatum|einstellung|geburtsdatum/i,
    abmeldungen: /abmeld|abwesen|urlaub/i,
    ausbildungen: /ausbildung|training|lehrgang|prüfung|zertifikat/i,
    rangwechsel: /beförder|degradier|rangänder|uprank|downrank/i,
    sanktionen: /sanktion|suspendier|verwarn|disziplinar/i,
    kuendigungen: /kündig|entlass|austritt/i,
    dienstzeiten: /dienstzeit|dienstbeginn|dienstende|im dienst|spielzeit/i,
    units: /unit|einheit|abteilung|versetz/i,
    vertraege: /vertrag|verträge|unterschrift/i,
    bewerbungen: /bewerb|vorstellungsgespräch/i,
    probezeiten: /probezeit/i,
    clips: /clips|🎥/i,
    rollenhistorie: /rollen-logs|rollenänder|rollenänderung|role.?update/i,
    mitgliederhistorie: /mitglieder-logs|nickname|nickname.?update/i,
    nachrichtenhistorie: /nachrichten-logs/i,
  }
  const fields = (message.embeds || []).flatMap(e => (e.fields || []).map(f => ({ label: f.name, value: f.value })))
  for (const match of text.matchAll(/^[ \t]*(?:[-*>][ \t]*)?(?:\*\*)?([\p{L}][^\n:*<>#]{0,79}):(?:\*\*)?[ \t]*(.+)$/gmu)) {
    if (!fields.some(f => f.label === match[1].trim() && f.value === match[2].trim())) fields.push({ label: match[1].trim(), value: match[2].trim() })
  }
  return {
    categories: Object.entries(patterns).filter(([, regex]) => regex.test(combined)).map(([category]) => category),
    fields, text,
    subjectDiscordIds: [...new Set(fields.filter(f => /^(officer|mitarbeiter|discord(?:-?id)?)$/i.test(f.label)).flatMap(f => [...f.value.matchAll(/<@!?(\d+)>/g)].map(m => m[1])))],
    mentionedDiscordIds: [...new Set([...text.matchAll(/<@!?(\d+)>/g)].map(m => m[1]))],
    mentionedRoleIds: [...new Set([...text.matchAll(/<@&(\d+)>/g)].map(m => m[1]))],
    displayedBadges: [...new Set([...text.matchAll(/\[([^\]\n]*\d[^\]\n]*)\]/g)].map(m => m[1]))],
    discordTimestamps: [...text.matchAll(/<t:(\d+)(?::\w)?>/g)].map(m => new Date(Number(m[1]) * 1000).toISOString()),
  }
}

export async function analyzeRecovery(directory) {
  const run = JSON.parse(await readFile(path.join(directory, 'run.json'), 'utf8'))
  const channels = JSON.parse(await readFile(path.join(directory, 'channels.json'), 'utf8'))
  const names = new Map(channels.map(c => [c.id, c.name]))
  try {
    const active = JSON.parse(await readFile(path.join(directory, 'active-threads.json'), 'utf8'))
    for (const thread of active.threads || []) names.set(thread.id, thread.name)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  try {
    const archived = await readFile(path.join(directory, 'archived-threads.jsonl'), 'utf8')
    for (const line of archived.split('\n').filter(Boolean)) {
      const thread = JSON.parse(line)
      names.set(thread.id, thread.name)
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const output = path.join(directory, `analysis-${Date.now()}`)
  await mkdir(output)
  const counts = {}
  let messages = 0
  for (const filename of await readdir(path.join(directory, 'messages'))) {
    if (!filename.endsWith('.jsonl')) continue
    const channelId = filename.slice(0, -6)
    const lines = createInterface({ input: createReadStream(path.join(directory, 'messages', filename)), crlfDelay: Infinity })
    for await (const line of lines) {
      if (!line.trim()) continue
      let message
      try { message = JSON.parse(line) } catch {
        counts.INVALID_JSON_LINE = (counts.INVALID_JSON_LINE || 0) + 1
        continue
      }
      messages++
      const evidence = classifyEvidence(message, names.get(channelId))
      const record = { ...evidence, channelId, channelName: names.get(channelId), messageId: message.id, timestamp: message.timestamp, editedTimestamp: message.edited_timestamp, authorId: message.author?.id, webhookId: message.webhook_id, source: `https://discord.com/channels/${run.guild}/${channelId}/${message.id}`, requiresReview: true, warning: 'Erwähnungen können Bearbeiter statt betroffene Mitarbeiter sein. Kategorien und Felder sind Belege, keine validierten Datensätze.' }
      for (const category of evidence.categories) {
        await appendFile(path.join(output, `${category}.jsonl`), JSON.stringify(record) + '\n')
        counts[category] = (counts[category] || 0) + 1
      }
    }
  }
  await writeFile(path.join(output, 'summary.json'), JSON.stringify({ messages, counts }, null, 2))
  await writeFile(path.join(output, 'README.md'), `# Ausgewertete Discord-Belege\n\n${messages} Nachrichten geprüft. Mehrfachzuordnungen sind möglich. Historische Nachrichten werden nicht zu aktuellen Zuständen zusammengeführt.\n\n${Object.entries(counts).map(([key, count]) => `- ${key}: ${count}`).join('\n')}\n\nFelder behalten den originalen Text und den Quellenlink. Keine Personenzuordnung allein anhand einer Erwähnung. Auch Beiträge ehemaliger Mitarbeiter bleiben enthalten.\n`)
  console.log(`HR-Auswertung: ${output}`)
  return { output, messages, counts }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.error('Aufruf: node scripts/analyze-discord-recovery.mjs <Sicherungsordner>'); process.exitCode = 1 }
  else analyzeRecovery(path.resolve(process.argv[2])).catch(error => { console.error(error.message); process.exitCode = 1 })
}
