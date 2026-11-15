import test from 'node:test'
import assert from 'node:assert/strict'
import { nicknameEvidence, messageText, requestJson } from './recover-discord.mjs'
import { classifyEvidence } from './analyze-discord-recovery.mjs'

test('absence details and personal-info channels are extracted without inventing identities', () => {
  const result = classifyEvidence({ components: [{ type: 10, content: '# Abmeldung: Max Muster\n- **Dienstnummer:** `[LSPD-042]`\n- **Von:** 15.11.2026\n- **Bis:** 20.11.2026\n- **Grund:** Urlaub\nBearbeiter <@123456789012345678>' }] }, 'personalinfo')
  assert.ok(result.categories.includes('abmeldungen'))
  assert.ok(result.categories.includes('personalinfo'))
  assert.ok(result.fields.some(f => f.label === 'Bis' && f.value === '20.11.2026'))
  assert.deepEqual(result.mentionedDiscordIds, ['123456789012345678'])
  assert.deepEqual(result.displayedBadges, ['LSPD-042'])
})

test('synchronized nickname preserves badge prefix and status markers', () => {
  assert.deepEqual(nicknameEvidence('[/] [X] [LSPD-042] Max Muster'), { displayedBadge: 'LSPD-042', displayName: 'Max Muster', promotionBlockedMarker: true, suspendedMarker: true, possiblyTruncated: false })
  assert.equal(nicknameEvidence('Some Discord Name'), null)
  assert.equal(nicknameEvidence('[LSPD-001] ' + 'a'.repeat(22)).possiblyTruncated, true)
})
test('extracts legacy embeds and nested Components V2', () => {
  assert.equal(messageText({ content: 'A', embeds: [{ title: 'B', fields: [{ name: 'Rang', value: 'Rookie' }] }], components: [{ type: 17, components: [{ type: 9, components: [{ type: 10, content: 'Dienstnummer: 042' }] }] }] }), 'A\nB\nRang: Rookie\nDienstnummer: 042')
})
test('honors rate limits and uses only GET without token in URL', async () => {
  let calls = 0
  const waits = []
  const result = await requestJson('/guilds/123/roles', 'secret', async (url, options) => {
    assert.equal(url.includes('secret'), false)
    assert.equal(options.method, undefined)
    assert.equal(options.headers.Authorization, 'Bot secret')
    return ++calls === 1 ? new Response(JSON.stringify({ retry_after: 2 }), { status: 429 }) : new Response('[]')
  }, async ms => waits.push(ms))
  assert.deepEqual(result, [])
  assert.deepEqual(waits, [2000])
})
test('permission failures retain Discord error code', async () => {
  await assert.rejects(requestJson('/test', 'secret', async () => new Response('{"code":50013}', { status: 403 })), error => error.code === 50013 && !error.message.includes('secret'))
})

test('timestamps and actor footers do not become personnel fields', () => {
  const result = classifyEvidence({ content: '-# Bearbeitet von <@123456789012345678> · <t:1794757726:f>\n- **Officer:** <@223456789012345678>\n- **Grund:** Urlaub' })
  assert.deepEqual(result.fields.map(f => f.label), ['Officer', 'Grund'])
  assert.deepEqual(result.subjectDiscordIds, ['223456789012345678'])
})
