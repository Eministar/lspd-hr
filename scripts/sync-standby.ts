import 'dotenv/config'
import { runBackup } from '../src/lib/db-backup'
import { restoreSnapshot } from '../src/lib/db-restore'

/**
 * Einmaliger Abgleich Haupt-Datenbank → Backup-Datei → Ausweich-Datenbank.
 *
 * Dieselbe Abfolge, die der Server stündlich von selbst fährt. Als Skript
 * nützlich für die Ersteinrichtung oder wenn der Abgleich lieber von einem
 * externen Scheduler (Plesk, Windows-Aufgabenplanung) kommen soll.
 */
async function main() {
  const url = process.env.DATABASE_URL_STANDBY?.trim()
  if (!url) throw new Error('DATABASE_URL_STANDBY fehlt.')

  const backup = await runBackup()
  console.log('Snapshot geschrieben:', backup.latestPath)

  const summary = await restoreSnapshot({ targetUrl: url, snapshotPath: backup.latestPath })
  console.log('Stand:', summary.exportedAt ?? 'unbekannt')
  console.log('Zeilen in die Ausweich-Datenbank gespiegelt:', summary.totalRows)
  if (summary.skippedModels.length > 0) {
    console.warn('Nicht eingespielt:', summary.skippedModels.join(', '))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
