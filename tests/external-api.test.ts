import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  externalApiSecret,
  parseListLimit,
  parseStatusFilter,
  toExternalOfficer,
  verifyExternalSecret,
} from '../src/lib/external-api'

const SECRET = 'x'.repeat(32)

test('Secret: zu kurz oder fehlend schaltet die API ab', () => {
  assert.equal(externalApiSecret({} as unknown as NodeJS.ProcessEnv), null)
  assert.equal(externalApiSecret({ FIB_API_SECRET: 'kurz' } as unknown as NodeJS.ProcessEnv), null)
  assert.equal(externalApiSecret({ FIB_API_SECRET: ` ${SECRET} ` } as unknown as NodeJS.ProcessEnv), SECRET)
})

test('Secret-Vergleich', () => {
  assert.equal(verifyExternalSecret(SECRET, SECRET), true)
  assert.equal(verifyExternalSecret(`${SECRET}y`, SECRET), false)
  assert.equal(verifyExternalSecret('', SECRET), false)
  assert.equal(verifyExternalSecret(null, SECRET), false)
  assert.equal(verifyExternalSecret(SECRET, null), false)
})

test('Filter und Limit', () => {
  assert.equal(parseListLimit(null), 25)
  assert.equal(parseListLimit('500'), 100)
  assert.equal(parseListLimit('-3'), 25)
  assert.deepEqual(parseStatusFilter('active, terminated,foo'), ['ACTIVE', 'TERMINATED'])
  assert.equal(parseStatusFilter('foo'), null)
})

test('Ausgabe enthält nur freigegebene Felder', () => {
  const row = {
    id: 'o1',
    firstName: 'Max',
    lastName: 'Muster',
    badgeNumber: '12',
    discordId: null,
    status: 'ACTIVE',
    unit: 'sru',
    units: null,
    hireDate: new Date('2026-01-01T00:00:00Z'),
    rank: { name: 'Officer', color: '#fff', sortOrder: 5 },
    notes: 'intern',
    flag: 'RED',
  }
  const officer = toExternalOfficer(row, new Map([['sru', 'Special Response Unit']]))
  assert.deepEqual(officer.units, [{ key: 'sru', name: 'Special Response Unit' }])
  assert.equal('notes' in officer, false)
  assert.equal('flag' in officer, false)
  assert.equal(officer.hireDate, '2026-01-01T00:00:00.000Z')
})
