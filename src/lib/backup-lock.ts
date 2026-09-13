import fs from 'node:fs/promises'
import path from 'node:path'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'

/** Exclusive lock shared by Node workers using the same backup directory. */
export async function acquireBackupLock(directory: string): Promise<(() => Promise<void>) | null> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const file = path.join(/*turbopackIgnore: true*/ directory, 'daily.lock')
  const token = randomUUID()
  try {
    const handle = await fs.open(file, 'wx', 0o600)
    try { await handle.writeFile(JSON.stringify({ token, pid: process.pid, host: hostname() })) }
    finally { await handle.close() }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    // A crashed local worker can be recovered without ever expiring a live backup.
    try {
      const owner = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ file, 'utf8'))
      if (owner.host === hostname() && Number.isInteger(owner.pid)) {
        try { process.kill(owner.pid, 0) } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
            // Recheck ownership before removing a dead worker's lock.
            const current = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ file, 'utf8'))
            if (current.token === owner.token) await fs.unlink(file)
          }
        }
      }
    } catch { /* A lock being created by another worker is treated as busy. */ }
    return null
  }
  return async () => {
    const owner = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ file, 'utf8'))
    if (owner.token === token) await fs.unlink(file)
  }
}
