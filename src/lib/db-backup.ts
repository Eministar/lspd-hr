import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '../generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { resolveDelegate } from './db-models'
import { backupFiles } from './backup-files'
import { readFailoverState } from './failover-state'

export const SNAPSHOT_FORMAT_VERSION = 3
export function backupDir() {
  return process.env.BACKUP_DIR?.trim() || path.join(/*turbopackIgnore: true*/ process.cwd(), '.backup')
}

export async function collectSnapshot(transaction: unknown, models = Prisma.dmmf.datamodel.models.map(model => model.name)) {
  const data: Record<string, unknown[]> = {}
  for (const name of models) {
    const delegate = resolveDelegate<{ findMany: () => Promise<unknown[]> }>(transaction, name)
    if (!delegate) throw new Error(`Backup abgebrochen: Modell ${name} fehlt.`)
    data[name] = await delegate.findMany()
  }
  return data
}

/** Publish only complete snapshots; failure must never replace the last good backup. */
export async function runBackup(options: { directory?: string; source?: 'primary' | 'active' } = {}) {
  const dir = options.directory ?? backupDir()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const source = options.source !== 'primary' && process.env.DATABASE_URL_STANDBY?.trim()
    ? readFailoverState().mode : 'primary'
  const url = (source === 'standby' ? process.env.DATABASE_URL_STANDBY : process.env.DATABASE_URL)?.trim()
  if (!url) throw new Error('Datenbank-URL fehlt – Backup nicht möglich.')
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) })
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
  const rotatedPath = path.join(/*turbopackIgnore: true*/ dir, `db-${stamp}.json`)
  const filesPath = `${rotatedPath}.files`
  const latestPath = path.join(/*turbopackIgnore: true*/ dir, 'latest.json')
  try {
    // Archive every model including the journal. Standby restore intentionally excludes the journal.
    const data = await prisma.$transaction(transaction => collectSnapshot(transaction),
      { isolationLevel: 'RepeatableRead', timeout: 300_000, maxWait: 30_000 })
    const files = await backupFiles(filesPath)
    const snapshot = {
      meta: { exportedAt: new Date().toISOString(), formatVersion: SNAPSHOT_FORMAT_VERSION,
        complete: true, source, filesDirectory: path.basename(filesPath), files },
      data,
    }
    const body = JSON.stringify(snapshot, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)
    await fs.writeFile(`${rotatedPath}.tmp`, body, { mode: 0o600 })
    await fs.rename(`${rotatedPath}.tmp`, rotatedPath)
    const latestTemp = path.join(/*turbopackIgnore: true*/ dir, `latest.tmp-${stamp}`)
    await fs.writeFile(latestTemp, body, { mode: 0o600 })
    await fs.rename(latestTemp, latestPath)
    // Daily snapshots have their own retention so hourly sync cannot evict them.
    const names = (await fs.readdir(/*turbopackIgnore: true*/ dir)).filter(name => /^db-.*\.json$/.test(name)).sort()
    for (const name of names.slice(0, -40)) {
      if (name === path.basename(rotatedPath)) continue
      await fs.unlink(path.join(/*turbopackIgnore: true*/ dir, name))
      await fs.rm(path.join(/*turbopackIgnore: true*/ dir, `${name}.files`), { recursive: true, force: true })
    }
    return { rotatedPath, latestPath, counts: Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length])) }
  } finally {
    await prisma.$disconnect()
  }
}
