import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { BackupFile } from './backup-files'

export function containedPath(root: string, relative: string) {
  if (!relative || relative.includes('\\') || relative.split('/').some(part => !part || part === '..' || part === '.') || path.isAbsolute(relative)) {
    throw new Error('Ungültiger Pfad im Backup.')
  }
  const resolved = path.resolve(/*turbopackIgnore: true*/ root, relative)
  const difference = path.relative(path.resolve(/*turbopackIgnore: true*/ root), resolved)
  if (difference.startsWith('..') || path.isAbsolute(difference)) throw new Error('Pfad außerhalb des Backups.')
  return resolved
}

export async function verifyBackup(snapshotPath: string) {
  const snapshot = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ snapshotPath, 'utf8'))
  if (snapshot.meta?.formatVersion !== 3 || snapshot.meta?.complete !== true || !Array.isArray(snapshot.meta.files)) {
    throw new Error('Keine vollständige Vollsicherung im Format 3.')
  }
  if (!snapshot.data || typeof snapshot.data !== 'object' || Object.values(snapshot.data).some(rows => !Array.isArray(rows))) {
    throw new Error('Ungültige Datenbank-Sicherung.')
  }
  const directory = containedPath(path.dirname(snapshotPath), snapshot.meta.filesDirectory)
  const files = snapshot.meta.files as BackupFile[]
  const seen = new Set<string>()
  for (const file of files) {
    if (seen.has(file.path)) throw new Error('Doppelter Pfad im Backup.')
    seen.add(file.path)
    const target = containedPath(directory, file.path)
    // Refuse symlinks in any path segment, including the companion directory.
    let current = directory
    for (const segment of ['', ...file.path.split('/')]) {
      current = path.join(/*turbopackIgnore: true*/ current, segment)
      if ((await fs.lstat(/*turbopackIgnore: true*/ current)).isSymbolicLink()) throw new Error('Symbolischer Link im Backup.')
    }
    const bytes = await fs.readFile(/*turbopackIgnore: true*/ target)
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw new Error(`Prüfsumme stimmt nicht: ${file.path}`)
    }
  }
  return { snapshot, directory, files }
}
