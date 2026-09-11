import 'dotenv/config'
import path from 'node:path'
import { restoreSnapshot } from '../src/lib/db-restore'
import { JOURNAL_MODEL } from '../src/lib/db-models'

/**
 * CLI-Hülle: spielt einen JSON-Snapshot in eine Datenbank ein.
 *
 *   npm run db:restore-standby                  → .backup/latest.json in die Standby-DB
 *   npx tsx prisma/restore.ts --file=<pfad>     → bestimmte Datei
 *   npx tsx prisma/restore.ts --target=primary --yes-overwrite-primary
 */
function argValue(name: string): string | null {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : null
}

async function main() {
  const target = argValue('target') ?? 'standby'
  const backupDir = process.env.BACKUP_DIR?.trim() || path.join(process.cwd(), '.backup')
  const file = argValue('file') ?? path.join(backupDir, 'latest.json')

  if (target !== 'standby' && target !== 'primary') {
    throw new Error('--target muss "standby" oder "primary" sein.')
  }

  // Die Haupt-Datenbank zu überschreiben ist der gefährlichste Fall dieses
  // Skripts — er verlangt eine ausdrückliche zweite Bestätigung.
  if (target === 'primary' && !process.argv.includes('--yes-overwrite-primary')) {
    throw new Error(
      'Das Einspielen in die HAUPT-Datenbank löscht dort alle Daten. '
      + 'Zum Bestätigen zusätzlich --yes-overwrite-primary angeben.',
    )
  }

  const url = (target === 'standby' ? process.env.DATABASE_URL_STANDBY : process.env.DATABASE_URL)?.trim()
  if (!url) {
    throw new Error(`${target === 'standby' ? 'DATABASE_URL_STANDBY' : 'DATABASE_URL'} fehlt.`)
  }

  const summary = await restoreSnapshot({ targetUrl: url, snapshotPath: file })
  console.log(`Snapshot eingespielt in: ${target}`)
  console.log('Datei:', summary.snapshotPath)
  console.log('Stand:', summary.exportedAt ?? 'unbekannt')
  console.log('Zeilen gesamt:', summary.totalRows)
  if (summary.skippedModels.length > 0) {
    console.warn('Nicht eingespielt:', summary.skippedModels.join(', '))
  }
  console.log(`Das Journal (${JOURNAL_MODEL}) bleibt unangetastet.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
