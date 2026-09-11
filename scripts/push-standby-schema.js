#!/usr/bin/env node
/**
 * Legt das Prisma-Schema in der Ausweich-Datenbank an.
 *
 * `prisma db push` kennt nur DATABASE_URL. Dieses Skript setzt für den
 * Unteraufruf DATABASE_URL auf DATABASE_URL_STANDBY — so lässt sich die zweite
 * Datenbank einrichten, ohne die .env umzuschreiben und dabei versehentlich
 * die Haupt-Datenbank zu treffen.
 */
require('dotenv/config')
const { spawnSync } = require('node:child_process')

const standby = (process.env.DATABASE_URL_STANDBY || '').trim()
if (!standby) {
  console.error('DATABASE_URL_STANDBY ist nicht gesetzt — nichts zu tun.')
  process.exit(1)
}

if (standby === (process.env.DATABASE_URL || '').trim()) {
  console.error('DATABASE_URL_STANDBY zeigt auf dieselbe Datenbank wie DATABASE_URL. Abbruch.')
  process.exit(1)
}

console.log('Schema wird in die Ausweich-Datenbank geschrieben …')
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'db', 'push', '--skip-generate'],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: standby } },
)

process.exit(result.status === null ? 1 : result.status)
