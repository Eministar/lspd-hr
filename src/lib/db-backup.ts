import fs from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { DATA_MODEL_NAMES, resolveDelegate } from './db-models'

/**
 * JSON-Snapshot der Datenbank.
 *
 * Die Modell-Liste kommt aus dem DMMF des generierten Clients: die frühere
 * handgepflegte Tabelle kannte nur 32 der 68 Modelle, wodurch ganze Bereiche
 * (Klagen, Formulare, SRU, Verträge, Bewerbungen …) still nicht gesichert
 * wurden. Jetzt ist jedes Modell automatisch dabei.
 *
 * Diese Datei ist zugleich die einzige Brücke zur Standby-Datenbank: die
 * beiden Datenbanken sprechen nie miteinander, der Standby wird ausschließlich
 * aus diesen Dateien befüllt (siehe `prisma/restore.ts`).
 */

/** Rotierte Zeitstempel-Backups; latest.json liegt immer zusätzlich daneben. */
const MAX_TIMESTAMPED_FILES = 40

export const SNAPSHOT_FORMAT_VERSION = 2

function isSchemaDriftBackupError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    ['P2021', 'P2022'].includes((e as { code: string }).code)
  )
}

async function loadSnapshot(prisma: PrismaClient) {
  const entries = await Promise.all(
    DATA_MODEL_NAMES.map(async (modelName) => {
      const delegate = resolveDelegate<{ findMany: () => Promise<unknown[]> }>(prisma, modelName)
      if (!delegate) {
        console.error(`Modell ${modelName} hat keinen Delegate im Prisma-Client; Snapshot enthält dafür [].`)
        return [modelName, []] as const
      }

      try {
        return [modelName, await delegate.findMany()] as const
      } catch (e) {
        if (isSchemaDriftBackupError(e)) {
          console.warn(
            `Tabelle ${modelName} konnte wegen Schema-Unterschied nicht gelesen werden; Snapshot enthält dafür [].`,
          )
          return [modelName, []] as const
        }

        // Jeder andere Fehler (z.B. "Unexpected end of JSON input" bei einer
        // Json-Spalte mit ungültigem Wert) darf das GESAMTE Backup nicht crashen.
        // Tabelle laut + benannt überspringen, damit ein partielles Backup
        // entsteht und die Ursache lokalisierbar ist.
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`Tabelle ${modelName} konnte NICHT gelesen werden (${msg}); Snapshot enthält dafür [].`)
        return [modelName, []] as const
      }
    }),
  )

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      note:
        'JSON-Snapshot sämtlicher lesbarer Tabellen, Schlüssel = Prisma-Modellname. '
        + 'Bei Schema-Updates können noch nicht vorhandene Tabellen/Spalten leer sein. '
        + 'Das Zurückspielen (prisma/restore.ts) schaltet die Fremdschlüsselprüfung aus, '
        + 'die Reihenfolge der Tabellen spielt daher keine Rolle.',
    },
    data: Object.fromEntries(entries),
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

export function backupDir() {
  return process.env.BACKUP_DIR?.trim() || path.join(process.cwd(), '.backup')
}

/**
 * Schreibt ein Backup und gibt die geschriebenen Pfade zurück.
 * Wird sowohl vom CLI-Aufruf als auch vom Standby-Sync verwendet.
 */
export async function runBackup(): Promise<{ rotatedPath: string; latestPath: string; counts: Record<string, number> }> {
  const dir = backupDir()
  await fs.mkdir(dir, { recursive: true })

  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL fehlt – Backup nicht möglich.')

  const adapter = new PrismaMariaDb(url)
  const prisma = new PrismaClient({ adapter })

  try {
    let snapshot
    try {
      snapshot = await loadSnapshot(prisma)
    } catch (e) {
      if (isSchemaDriftBackupError(e)) {
        console.warn('Noch keine (vollständige) Datenbank — leeres Snapshot (z.B. vor erstem prisma db push).')
        snapshot = {
          meta: {
            exportedAt: new Date().toISOString(),
            formatVersion: SNAPSHOT_FORMAT_VERSION,
            note: 'Leeres Snapshot (Tabellen fehlten zum Exportzeitpunkt). Nach db push enthält das nächste Backup die Daten.',
          },
          data: Object.fromEntries(DATA_MODEL_NAMES.map((name) => [name, []])),
        }
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

    return { rotatedPath, latestPath, counts }
  } finally {
    await prisma.$disconnect()
  }
}
