import test from 'node:test'
import assert from 'node:assert/strict'
import { berlinDate, buildPlan } from './import-discord-recovery.mjs'

test('German dates use Berlin winter/summer offset and reject impossible dates', () => {
  assert.equal(berlinDate('15.11.26, 21:00'), '2026-11-15T20:00:00.000Z')
  assert.equal(berlinDate('15.07.2026, 21:00'), '2026-07-15T19:00:00.000Z')
  assert.equal(berlinDate('31.02.26, 21:00'), null)
  assert.equal(berlinDate('Keine Frist'), null)
})

function fixture() {
  return { meta: { exportedAt: '2026-10-25T00:00:00.000Z' }, data: {
    Rank: [{ id: 'r', name: 'Officer' }], Training: [], Unit: [], Officer: [], User: [], AbsenceNotice: [], OfficerTraining: [],
    SystemSetting: [{ key: 'discord.rankRoleMap', value: '{"r":"100"}' }, { key: 'discord.guildId', value: '123' }],
  } }
}
function event(id, heading, timestamp, details) {
  return { id, channel_id: 'c', author: { id: 'bot' }, timestamp, content: `# ${heading} · Max Muster\n- **Dienstnummer:** \`[LSPD-01]\`\n- **Rang:** <@&100>\n${details}` }
}
test('duplicate hires retain clip identity and sources; actor mention does not become subject', () => {
  const member = { user: { id: '42' }, nick: '[LSPD-01] Max Muster', roles: ['100'] }
  const clips = [{ oldOfficerId: 'original-id', possibleDiscordIds: ['42'] }]
  const messages = ['1', '2'].map((id, i) => event(id, 'Neueinstellung', `2026-10-26T10:0${i}:00.000Z`, '- **Eintrittsdatum:** <t:1792969200:D>\nMit freundlichen Grüßen\n<@999>'))
  const plan = buildPlan(fixture(), [member], clips, messages, 'bot', new Date('2026-11-15T10:00:00Z'))
  assert.equal(plan.createdOfficerIds.length, 1)
  assert.equal(plan.officers[0].id, 'original-id')
  assert.equal(plan.officers[0].discordId, '42')
  assert.equal(plan.notes.length, 2)
})
test('untrusted messages do not create officers', () => {
  const message = event('1', 'Neueinstellung', '2026-10-26T10:00:00Z', '- **Eintrittsdatum:** <t:1792969200:D>')
  message.author.id = 'someone-else'
  assert.equal(buildPlan(fixture(), [], [], [message], 'bot').officers.length, 0)
})
test('absence end uses local zone; inferred start and historical termination are preserved', () => {
  const base = fixture()
  base.data.Officer = [{ id: 'o', firstName: 'Max', lastName: 'Muster', badgeNumber: 'LSPD-01', rankId: 'r', status: 'ACTIVE', discordId: null }]
  const messages = [event('1', 'Abmeldung', '2026-10-26T10:00:00.000Z', '- **Bis:** 30.10.26, 21:00\n- **Grund:** Urlaub'), event('2', 'Abmeldung beendet', '2026-10-27T10:00:00.000Z', '')]
  const plan = buildPlan(base, [], [], messages, 'bot')
  assert.equal(plan.absences[0].source, 'discord-recovery-start-inferred')
  assert.equal(plan.absences[0].endsAt, '2026-10-27T10:00:00.000Z')
})
