/* eslint-disable @typescript-eslint/no-require-imports */

require('dotenv/config')

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const projectDir = path.resolve(__dirname, '..')
const prismaCli = path.join(projectDir, 'node_modules', 'prisma', 'build', 'index.js')
const importFile = path.join(projectDir, 'prisma', 'initial-import-2026-06-19.sql')
const importMarkerKey = 'database.initialImport.2026-06-19'
const expectedImportCounts = {
  ranks: 16,
  officers: 38,
  dutySessions: 38,
  promotionLogs: 58,
  sanctions: 3,
}
const { normalizeBadgeNumbers } = require('./normalize-badge-numbers')

function runPrisma(args, label) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: projectDir,
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit',
  })

  if (result.error) {
    throw new Error(`${label} konnte nicht gestartet werden: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`${label} ist mit Exit-Code ${result.status} fehlgeschlagen.`)
  }
}

function loadPrisma() {
  const { PrismaClient } = require('../src/generated/prisma/client')
  const { PrismaMariaDb } = require('@prisma/adapter-mariadb')
  const databaseUrl = String(process.env.DATABASE_URL || '').trim()

  if (!databaseUrl) {
    throw new Error('DATABASE_URL fehlt oder ist leer.')
  }

  return new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) })
}

async function main() {
  if (!fs.existsSync(prismaCli)) {
    throw new Error(`Prisma CLI wurde nicht gefunden: ${prismaCli}`)
  }

  console.log('[DB] Schema wird sicher synchronisiert.')
  runPrisma(['db', 'push'], 'prisma db push')

  const prisma = loadPrisma()
  try {
    const marker = await prisma.systemSetting.findUnique({
      where: { key: importMarkerKey },
    })

    if (marker) {
      const normalized = await normalizeBadgeNumbers(prisma)
      console.log(`[DB] Dienstnummern normalisiert: ${normalized.officers} Officers, ${normalized.blacklist} Blacklist-Einträge.`)
      console.log('[DB] Initialimport wurde bereits verarbeitet.')
      return
    }

    const [rankCount, officerCount, userCount] = await Promise.all([
      prisma.rank.count(),
      prisma.officer.count(),
      prisma.user.count(),
    ])

    if (rankCount > 0 || officerCount > 0 || userCount > 0) {
      const normalized = await normalizeBadgeNumbers(prisma)
      console.log(`[DB] Dienstnummern normalisiert: ${normalized.officers} Officers, ${normalized.blacklist} Blacklist-Einträge.`)
      await prisma.systemSetting.create({
        data: {
          key: importMarkerKey,
          value: JSON.stringify({
            status: 'skipped-existing-database',
            processedAt: new Date().toISOString(),
          }),
        },
      })
      console.log('[DB] Bestehende Daten erkannt; Initialimport wird dauerhaft übersprungen.')
      return
    }

    if (!fs.existsSync(importFile)) {
      throw new Error(`Initialimport fehlt: ${importFile}`)
    }

    console.log('[DB] Leere Datenbank erkannt; Initialimport wird einmalig ausgeführt.')
    runPrisma(['db', 'execute', '--file', importFile], 'Initialimport')

    const importedCounts = {
      ranks: await prisma.rank.count({
        where: { id: { startsWith: 'rank_' } },
      }),
      officers: await prisma.officer.count({
        where: { id: { startsWith: 'officer_' } },
      }),
      dutySessions: await prisma.dutyTimeSession.count({
        where: { id: { startsWith: 'duty_import_' } },
      }),
      promotionLogs: await prisma.promotionLog.count({
        where: { id: { startsWith: 'promo_import_' } },
      }),
      sanctions: await prisma.sanction.count({
        where: { id: { startsWith: 'sanction_import_' } },
      }),
    }

    const incompleteEntries = Object.entries(expectedImportCounts)
      .filter(([key, expected]) => importedCounts[key] !== expected)
      .map(([key, expected]) => `${key}: ${importedCounts[key]}/${expected}`)

    if (incompleteEntries.length > 0) {
      throw new Error(`Initialimport ist unvollständig: ${incompleteEntries.join(', ')}`)
    }

    const normalized = await normalizeBadgeNumbers(prisma)
    console.log(`[DB] Dienstnummern normalisiert: ${normalized.officers} Officers, ${normalized.blacklist} Blacklist-Einträge.`)

    await prisma.systemSetting.create({
      data: {
        key: importMarkerKey,
        value: JSON.stringify({
          status: 'imported',
          file: path.basename(importFile),
          counts: importedCounts,
          processedAt: new Date().toISOString(),
        }),
      },
    })
    console.log('[DB] Initialimport erfolgreich abgeschlossen und markiert.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('[DB] Initialisierung fehlgeschlagen:', error)
  process.exit(1)
})
