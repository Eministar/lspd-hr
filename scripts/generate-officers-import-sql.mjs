/**
 * Generiert MySQL-INSERT aus phpMyAdmin Officer-JSON (Top-Level Array mit type:table).
 *
 * Aufruf:
 *   node scripts/generate-officers-import-sql.mjs "c:\\...\\officer.json" prisma/import-officers.sql
 */

import fs from 'node:fs'

const jsonPath = process.argv[2]
if (!jsonPath) {
  console.error('Nutze: node scripts/generate-officers-import-sql.mjs <officer.json> [ausgabe.sql]')
  process.exit(1)
}

const raw = fs.readFileSync(jsonPath, 'utf8')

/** Alte rankId → aktuelle Seed-sortOrder (prisma/seed.ts: 1=Chief … 15=Rookie) */
const RANK_OLD_TO_SORT = new Map([
  ['cmohdygmh0001zsuiu7pvbw9h', 1],
  ['cmohdygmn0002zsuiqvmh4yst', 2],
  ['cmohdygms0003zsuirc635hk8', 3],
  ['cmohdygmw0004zsui1o5tusvp', 4],
  ['cmohdygn00005zsui4p9yikf7', 5],
  ['cmohdygn40006zsuif51lsr4y', 6],
  ['cmohdygn80007zsui20zg1no8', 7],
  ['cmohdygnd0008zsui26djz10o', 8],
  ['cmohdygni0009zsuihrx9sscm', 9],
  ['cmohdygnq000azsuis5bfj2fy', 10],
  ['cmohdygnw000bzsuijej49ekj', 11],
  ['cmohdygo5000czsuihrh9hsf5', 12],
  ['cmohdygob000dzsuillr53lbf', 13],
  ['cmohdygor000ezsuiegn1pyxk', 14],
  ['cmohdygov000fzsuivra8yrl3', 15],
])

function extractDataArray(text) {
  const j = JSON.parse(text)
  if (!Array.isArray(j)) throw new Error('Top-Level ist kein Array')
  const tbl = j.find((x) => x && x.type === 'table' && x.name === 'officer')
  if (!tbl || !Array.isArray(tbl.data)) throw new Error('Table officer / data nicht gefunden')
  return tbl.data
}

function q(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\0/g, '') + "'"
}

function dt(v) {
  if (v == null || v === '') return 'NULL'
  const s = String(v).replace('T', ' ').slice(0, 23)
  return `'${String(s).replace(/'/g, "''")}'`
}

const rows = extractDataArray(raw).filter((r) => r && r.id && r.badgeNumber !== undefined)
const seenDiscord = new Set()
const values = []

for (const row of rows) {
  const sort = RANK_OLD_TO_SORT.get(row.rankId)
  if (sort == null) {
    console.warn('SKIP unbekanntes rankId:', row.rankId, 'badge', row.badgeNumber)
    continue
  }

  const discordRaw =
    typeof row.discordId === 'string'
      ? row.discordId.trim()
      : row.discordId == null
        ? ''
        : String(row.discordId).trim()

  let discordSql = 'NULL'
  if (discordRaw !== '') {
    if (seenDiscord.has(discordRaw)) {
      discordSql = 'NULL'
    } else {
      seenDiscord.add(discordRaw)
      discordSql = q(discordRaw)
    }
  }

  let unitSql = 'NULL'
  if (row.unit != null && String(row.unit).trim() !== '') {
    unitSql = q(String(row.unit).trim())
  }

  let notesSql = 'NULL'
  if (row.notes !== null && row.notes !== undefined) {
    notesSql = row.notes === '' ? "''" : q(String(row.notes))
  }

  let flagSql = 'NULL'
  if (row.flag != null && String(row.flag).trim() !== '') {
    flagSql = q(String(row.flag).trim())
  }

  const rankSub = `(SELECT id FROM Rank WHERE sortOrder = ${sort} LIMIT 1)`

  values.push(
    `(${q(row.id)}, ${q(row.badgeNumber)}, ${discordSql}, ${q(row.firstName)}, ${q(row.lastName)}, ${rankSub}, ${q(row.status)}, ${unitSql}, ${flagSql}, ${notesSql}, ${dt(row.hireDate)}, ${row.lastOnline ? dt(row.lastOnline) : 'NULL'}, ${dt(row.createdAt)}, ${dt(row.updatedAt)})`,
  )
}

const outPath = process.argv[3]

const headerPart = `-- Officers-Import aus phpMyAdmin JSON
-- VORAUSSETZUNG: npm run db:seed oder identische Rank-Zeilen (sortOrder 1..15)
-- Doppelte discordId: nur erster Eintrag mit Wert, weitere NULL (Unique)

SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM \`Officer\`;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO \`Officer\` (
  \`id\`, \`badgeNumber\`, \`discordId\`, \`firstName\`, \`lastName\`, \`rankId\`,
  \`status\`, \`unit\`, \`flag\`, \`notes\`, \`hireDate\`,
  \`lastOnline\`, \`createdAt\`, \`updatedAt\`
) VALUES
`

const full = `${headerPart}${values.join(',\n')};`

if (outPath) {
  fs.writeFileSync(outPath, full, 'utf8')
  console.error(`Geschrieben: ${outPath} (${values.length} Zeilen)`)
} else {
  process.stdout.write(full)
}