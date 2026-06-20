/* eslint-disable @typescript-eslint/no-require-imports */

require('dotenv/config')

function createPrisma() {
  const { PrismaClient } = require('../src/generated/prisma/client')
  const { PrismaMariaDb } = require('@prisma/adapter-mariadb')
  const databaseUrl = String(process.env.DATABASE_URL || '').trim()
  if (!databaseUrl) throw new Error('DATABASE_URL fehlt oder ist leer.')
  return new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) })
}

function normalizedBadgeNumber(badgeNumber, prefix) {
  const trimmed = String(badgeNumber || '').trim()
  const raw = prefix && trimmed.startsWith(prefix)
    ? trimmed.slice(prefix.length)
    : trimmed

  if (!/^\d$/.test(raw)) return null
  return `${prefix}${raw.padStart(2, '0')}`
}

async function normalizeBadgeNumbers(prisma) {
  const [prefixSetting, officers, blacklist] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'badgePrefix' } }),
    prisma.officer.findMany({ select: { id: true, badgeNumber: true } }),
    prisma.badgeBlacklist.findMany({ select: { id: true, badgeNumber: true } }),
  ])
  const prefix = prefixSetting?.value?.trim() || ''
  const occupied = new Set([
    ...officers.map((row) => row.badgeNumber),
    ...blacklist.map((row) => row.badgeNumber),
  ])
  const officerUpdates = []
  const blacklistUpdates = []

  for (const officer of officers) {
    const normalized = normalizedBadgeNumber(officer.badgeNumber, prefix)
    if (!normalized || normalized === officer.badgeNumber || occupied.has(normalized)) continue
    occupied.delete(officer.badgeNumber)
    occupied.add(normalized)
    officerUpdates.push(prisma.officer.update({
      where: { id: officer.id },
      data: { badgeNumber: normalized },
    }))
  }

  for (const entry of blacklist) {
    const normalized = normalizedBadgeNumber(entry.badgeNumber, prefix)
    if (!normalized || normalized === entry.badgeNumber || occupied.has(normalized)) continue
    occupied.delete(entry.badgeNumber)
    occupied.add(normalized)
    blacklistUpdates.push(prisma.badgeBlacklist.update({
      where: { id: entry.id },
      data: { badgeNumber: normalized },
    }))
  }

  if (officerUpdates.length + blacklistUpdates.length > 0) {
    await prisma.$transaction([...officerUpdates, ...blacklistUpdates])
  }

  return {
    officers: officerUpdates.length,
    blacklist: blacklistUpdates.length,
  }
}

async function main() {
  const prisma = createPrisma()
  try {
    const result = await normalizeBadgeNumbers(prisma)
    console.log(
      `[DB] Dienstnummern normalisiert: ${result.officers} Officers, ${result.blacklist} Blacklist-Einträge.`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[DB] Dienstnummern-Normalisierung fehlgeschlagen:', error)
    process.exit(1)
  })
}

module.exports = { normalizeBadgeNumbers }
