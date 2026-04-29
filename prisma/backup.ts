import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

/** Rotierte Zeitstempel-Backups; latest.json liegt immer zusätzlich daneben. */
const MAX_TIMESTAMPED_FILES = 40

function emptySnapshot(reason: string) {
  return {
    meta: {
      exportedAt: new Date().toISOString(),
      formatVersion: 1 as const,
      note: reason,
    },
    data: {
      userGroups: [],
      users: [],
      units: [],
      ranks: [],
      trainings: [],
      officers: [],
      officerTrainings: [],
      promotionLogs: [],
      terminations: [],
      notes: [],
      auditLogs: [],
      rankChangeLists: [],
      rankChangeListEntries: [],
      systemSettings: [],
      taskLists: [],
      tasks: [],
      taskAssignments: [],
    },
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

async function loadSnapshot(prisma: PrismaClient) {
  const [
    userGroups,
    users,
    units,
    ranks,
    trainings,
    officers,
    officerTrainings,
    promotionLogs,
    terminations,
    notes,
    auditLogs,
    rankChangeLists,
    rankChangeListEntries,
    systemSettings,
    taskLists,
    tasks,
    taskAssignments,
  ] = await Promise.all([
    prisma.userGroup.findMany(),
    prisma.user.findMany(),
    prisma.unit.findMany(),
    prisma.rank.findMany(),
    prisma.training.findMany(),
    prisma.officer.findMany(),
    prisma.officerTraining.findMany(),
    prisma.promotionLog.findMany(),
    prisma.termination.findMany(),
    prisma.note.findMany(),
    prisma.auditLog.findMany(),
    prisma.rankChangeList.findMany(),
    prisma.rankChangeListEntry.findMany(),
    prisma.systemSetting.findMany(),
    prisma.taskList.findMany(),
    prisma.task.findMany(),
    prisma.taskAssignment.findMany(),
  ])

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      formatVersion: 1 as const,
      note:
        'Vollständiger JSON-Snapshot sämtlicher Tabellen. Bei Restore die FK-Reihenfolge beachten (UserGroup vor User, Rank vor Officer, …).',
    },
    data: {
      userGroups,
      users,
      units,
      ranks,
      trainings,
      officers,
      officerTrainings,
      promotionLogs,
      terminations,
      notes,
      auditLogs,
      rankChangeLists,
      rankChangeListEntries,
      systemSettings,
      taskLists,
      tasks,
      taskAssignments,
    },
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
