import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

/** Rotierte Zeitstempel-Backups; latest.json liegt immer zusätzlich daneben. */
const MAX_TIMESTAMPED_FILES = 40

type SnapshotData = {
  userGroups: unknown[]
  users: unknown[]
  units: unknown[]
  ranks: unknown[]
  trainings: unknown[]
  officers: unknown[]
  officerTrainings: unknown[]
  promotionLogs: unknown[]
  terminations: unknown[]
  notes: unknown[]
  auditLogs: unknown[]
  rankChangeLists: unknown[]
  rankChangeListEntries: unknown[]
  systemSettings: unknown[]
  taskLists: unknown[]
  tasks: unknown[]
  taskAssignments: unknown[]
}

type Snapshot = {
  meta: {
    exportedAt: string
    formatVersion: 1
    note: string
  }
  data: SnapshotData
}

type SnapshotKey = keyof SnapshotData
type FindManyDelegate = { findMany: () => Promise<unknown[]> }

const TABLES: { key: SnapshotKey; delegateNames: readonly string[] }[] = [
  { key: 'userGroups', delegateNames: ['userGroup', 'usergroup'] },
  { key: 'users', delegateNames: ['user'] },
  { key: 'units', delegateNames: ['unit'] },
  { key: 'ranks', delegateNames: ['rank'] },
  { key: 'trainings', delegateNames: ['training'] },
  { key: 'officers', delegateNames: ['officer'] },
  { key: 'officerTrainings', delegateNames: ['officerTraining', 'officertraining'] },
  { key: 'promotionLogs', delegateNames: ['promotionLog', 'promotionlog'] },
  { key: 'terminations', delegateNames: ['termination'] },
  { key: 'notes', delegateNames: ['note'] },
  { key: 'auditLogs', delegateNames: ['auditLog', 'auditlog'] },
  { key: 'rankChangeLists', delegateNames: ['rankChangeList', 'rankchangelist'] },
  {
    key: 'rankChangeListEntries',
    delegateNames: ['rankChangeListEntry', 'rankchangelistentry', 'rankchangeentry'],
  },
  { key: 'systemSettings', delegateNames: ['systemSetting', 'systemsetting'] },
  { key: 'taskLists', delegateNames: ['taskList', 'tasklist'] },
  { key: 'tasks', delegateNames: ['task'] },
  { key: 'taskAssignments', delegateNames: ['taskAssignment', 'taskassignment'] },
]

function createEmptyData(): SnapshotData {
  return Object.fromEntries(TABLES.map(({ key }) => [key, []])) as unknown as SnapshotData
}

function emptySnapshot(reason: string): Snapshot {
  return {
    meta: {
      exportedAt: new Date().toISOString(),
      formatVersion: 1 as const,
      note: reason,
    },
    data: createEmptyData(),
  }
}

function isMissingTableError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: string }).code === 'P2021'
  )
}

function getFindManyDelegate(prisma: PrismaClient, names: readonly string[]): FindManyDelegate {
  const client = prisma as unknown as Record<string, FindManyDelegate | undefined>
  const delegate = names.map((name) => client[name]).find(Boolean)
  if (!delegate) {
    throw new Error(`Prisma-Delegate nicht gefunden: ${names.join(' / ')}`)
  }
  return delegate
}

async function loadSnapshot(prisma: PrismaClient): Promise<Snapshot> {
  const entries = await Promise.all(
    TABLES.map(async ({ key, delegateNames }) => [
      key,
      await getFindManyDelegate(prisma, delegateNames).findMany(),
    ] as const),
  )

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      formatVersion: 1 as const,
      note:
        'Vollständiger JSON-Snapshot sämtlicher Tabellen. Bei Restore die FK-Reihenfolge beachten (UserGroup vor User, Rank vor Officer, …).',
    },
    data: Object.fromEntries(entries) as unknown as SnapshotData,
  }
}

async function pruneOldBackups(dir: string) {
  const names = await fs.readdir(dir)
  const dated = names
    .filter((n) => /^db-.*\.json$/.test(n))
    .map((name) => ({ name, m: name.match(/^db-(.*)\.json$/) }))
    .filter((x): x is { name: string; m: RegExpMatchArray } => x.m !== null)

  if (dated.length <= MAX_TIMESTAMPED_FILES) return

  const sorted = dated.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const excess = sorted.slice(0, dated.length - MAX_TIMESTAMPED_FILES)
  for (const { name } of excess) {
    await fs.unlink(path.join(dir, name)).catch(() => {})
  }
}

async function main() {
  const dir = path.join(process.cwd(), '.backup')
  await fs.mkdir(dir, { recursive: true })

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL fehlt – Backup nicht möglich.')
    process.exit(1)
  }

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL)
  const prisma = new PrismaClient({ adapter })

  try {
    let snapshot: Awaited<ReturnType<typeof loadSnapshot>>
    try {
      snapshot = await loadSnapshot(prisma)
    } catch (e) {
      if (isMissingTableError(e)) {
        console.warn(
          'Noch keine (vollständige) Datenbank — leeres Snapshot (z.B. vor erstem prisma db push).',
        )
        snapshot = emptySnapshot(
          'Leeres Snapshot (Tabellen fehlten zum Exportzeitpunkt). Nach db push enthält das nächste Backup die Daten.',
        )
      } else {
        throw e
      }
    }
    const body = JSON.stringify(snapshot, null, 2)

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const rotatedPath = path.join(dir, `db-${stamp}.json`)
    const latestPath = path.join(dir, 'latest.json')

    await fs.writeFile(rotatedPath, body, 'utf8')
    await fs.writeFile(latestPath, body, 'utf8')

    await pruneOldBackups(dir)

    const counts = Object.fromEntries(
      Object.entries(snapshot.data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
    )

    console.log('Backup geschrieben:', rotatedPath)
    console.log('Aktuelle Kopie:', latestPath)
    console.log('Zeilen:', counts)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
