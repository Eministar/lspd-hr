import 'dotenv/config'
import { runBackup } from '../src/lib/db-backup'

/**
 * CLI-Hülle für `npm run db:backup`.
 * Die Logik liegt in `src/lib/db-backup.ts`, damit der Standby-Sync im
 * laufenden Server dieselbe Implementierung benutzt.
 */
async function main() {
  const { rotatedPath, latestPath, counts } = await runBackup()
  console.log('Backup geschrieben:', rotatedPath)
  console.log('Aktuelle Kopie:', latestPath)
  console.log('Zeilen:', counts)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
