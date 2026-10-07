import test from 'node:test'
import assert from 'node:assert/strict'
import { isSuspended, suspensionSchema } from '../src/lib/suspension'

const now = Date.parse('2026-10-07T12:00:00Z')
test('suspension ends exactly at its deadline regardless of status automation', () => {
  assert.equal(isSuspended({ suspendedUntil: new Date(now + 1) }, now), true)
  assert.equal(isSuspended({ suspendedUntil: new Date(now) }, now), false)
  assert.equal(isSuspended({ suspendedUntil: new Date(now - 1) }, now), false)
  assert.equal(isSuspended({ suspendedUntil: '2026-10-07T14:01:00+02:00' }, now), true)
  assert.equal(isSuspended({ suspendedUntil: null }, now), false)
  assert.equal(isSuspended({ suspendedUntil: 'invalid' }, now), false)
})
test('terminated officers never carry an active suspension marker', () => {
  assert.equal(isSuspended({ status: 'TERMINATED', suspendedUntil: new Date(now + 1000) }, now), false)
  for (const status of ['ACTIVE', 'AWAY', 'INACTIVE']) {
    assert.equal(isSuspended({ status, suspendedUntil: new Date(now + 1000) }, now), true)
  }
})
test('duration validation rejects invalid and excessive durations', () => {
  for (const durationHours of [0, -1, 0.5, 8761, Infinity, '24', null]) {
    assert.equal(suspensionSchema.safeParse({ durationHours }).success, false)
  }
  assert.equal(suspensionSchema.safeParse({ durationHours: 1 }).success, true)
  assert.equal(suspensionSchema.safeParse({ durationHours: 8760 }).success, true)
  assert.equal(suspensionSchema.safeParse({ durationHours: 24, reason: 'x'.repeat(2001) }).success, false)
  assert.deepEqual(suspensionSchema.parse({ durationHours: 24, reason: ' Grund ' }), { durationHours: 24, reason: 'Grund' })
})
