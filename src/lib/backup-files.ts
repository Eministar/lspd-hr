import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { uploadDir } from './uploads'
import { failoverStateDir } from './failover-state'

export type BackupFile = { path: string; bytes: number; sha256: string }
export async function backupFiles(destination: string): Promise<BackupFile[]> {
  const manifest: BackupFile[] = []
  async function copy(source: string, relative: string, optional = false) {
    let info
    try { info = await fs.lstat(/*turbopackIgnore: true*/ source) } catch (error) {
      if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    if (info.isSymbolicLink()) throw new Error(`Backup: symbolischer Link nicht unterstützt: ${relative}`)
    if (info.isDirectory()) {
      for (const name of (await fs.readdir(/*turbopackIgnore: true*/ source)).sort()) {
        if (name.endsWith('.lock') || name.includes('.tmp-')) continue
        await copy(path.join(/*turbopackIgnore: true*/ source, name), `${relative}/${name}`)
      }
      return
    }
    if (!info.isFile()) throw new Error(`Backup: keine reguläre Datei: ${relative}`)
    const target = path.join(/*turbopackIgnore: true*/ destination, relative)
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    await fs.copyFile(source, target)
    await fs.chmod(target, 0o600)
    const bytes = await fs.readFile(/*turbopackIgnore: true*/ target)
    manifest.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  for (const source of [uploadDir(), failoverStateDir()]) {
    const relative = path.relative(path.resolve(/*turbopackIgnore: true*/ source), path.resolve(/*turbopackIgnore: true*/ destination))
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('BACKUP_DIR darf nicht innerhalb eines gesicherten Verzeichnisses liegen.')
  }
  await fs.mkdir(destination, { recursive: true, mode: 0o700 })
  await copy(uploadDir(), 'uploads', true)
  await copy(failoverStateDir(), 'failover', true)
  for (const name of (await fs.readdir(/*turbopackIgnore: true*/ process.cwd())).filter(name => /^\.env(?:\.|$)/.test(name))) {
    await copy(path.join(/*turbopackIgnore: true*/ process.cwd(), name), `config/${name}`)
  }
  for (const name of ['prisma/schema.prisma', 'package.json', 'package-lock.json', 'start.js', 'web.config']) {
    await copy(path.join(/*turbopackIgnore: true*/ process.cwd(), name), `config/${name}`, true)
  }
  return manifest
}
