import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { verifyBackup, containedPath } from '../src/lib/backup-verify'

async function main() {
  const file = process.argv.find(arg => arg.startsWith('--file='))?.slice(7)
  if (!file) throw new Error('--file=<snapshot.json> fehlt.')
  const { directory, files, snapshot } = await verifyBackup(file)
  console.log(`Vollsicherung geprüft: ${Object.keys(snapshot.data).length} Modelle, ${files.length} Dateien.`)
  const destination = process.argv.find(arg => arg.startsWith('--extract='))?.slice(10)
  if (destination) {
    // Only extract into a new directory: existing application data is never overwritten.
    await fs.mkdir(destination, { mode: 0o700 })
    for (const item of files) {
      const target = containedPath(destination, item.path)
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
      await fs.copyFile(containedPath(directory, item.path), target, 1)
      await fs.chmod(target, 0o600)
    }
    console.log('Dateien in neues Wiederherstellungsverzeichnis extrahiert.')
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Backup-Prüfung fehlgeschlagen.'); process.exitCode = 1 })
