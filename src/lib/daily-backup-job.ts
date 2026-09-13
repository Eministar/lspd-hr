import fs from 'node:fs/promises'
import path from 'node:path'
import cron from 'node-cron'
import { backupDir, runBackup } from './db-backup'
import { acquireBackupLock } from './backup-lock'

const globalBackup = globalThis as unknown as { dailyBackupStarted?: boolean; dailyBackupRunning?: boolean }
export function berlinDay(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(date)
}
export async function readDailyBackupStatus() {
  try { return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ backupDir(), 'daily-status.json'), 'utf8')) as {
    lastSuccess: string | null; lastAttempt: string; error: string | null
  } } catch { return null }
}
export async function runDailyBackup() {
  if (globalBackup.dailyBackupRunning) return
  globalBackup.dailyBackupRunning = true
  let release: (() => Promise<void>) | null = null
  try {
    release = await acquireBackupLock(backupDir())
    if (!release) return
    const previous = await readDailyBackupStatus()
    if (previous?.lastSuccess && berlinDay(new Date(previous.lastSuccess)) === berlinDay()) return
    const status = { lastSuccess: previous?.lastSuccess ?? null, lastAttempt: new Date().toISOString(), error: null as string | null }
    try {
      await runBackup({ directory: path.join(/*turbopackIgnore: true*/ backupDir(), 'daily') })
      status.lastSuccess = new Date().toISOString()
    } catch (error) {
      status.error = error instanceof Error ? error.message : String(error)
      console.error('[DailyBackup] Vollsicherung fehlgeschlagen:', error)
    }
    await fs.mkdir(backupDir(), { recursive: true, mode: 0o700 })
    const target = path.join(/*turbopackIgnore: true*/ backupDir(), 'daily-status.json')
    const temp = `${target}.tmp-${process.pid}`
    await fs.writeFile(temp, JSON.stringify(status), { mode: 0o600 })
    await fs.rename(temp, target)
  } finally {
    try { await release?.() } finally { globalBackup.dailyBackupRunning = false }
  }
}
export function ensureDailyBackupScheduler() {
  if (globalBackup.dailyBackupStarted || process.env.NEXT_PHASE === 'phase-production-build') return
  globalBackup.dailyBackupStarted = true
  const attempt = () => { void runDailyBackup().catch(error => console.error('[DailyBackup]', error)) }
  // Check hourly, save once per Berlin day, retry errors and catch up after downtime.
  cron.schedule('0 * * * *', attempt, { timezone: 'Europe/Berlin', noOverlap: true })
  attempt()
}
