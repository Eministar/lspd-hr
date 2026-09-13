import fs from 'node:fs'
import path from 'node:path'
import cron from 'node-cron'
import { runBackup } from './db-backup'
import { restoreSnapshot } from './db-restore'
import { activeMode, isFailoverConfigured, standbyUrl } from './db-failover'
import { failoverStateDir } from './failover-state'

/**
 * Hält die Standby-Datenbank über die Backup-Dateien aktuell.
 *
 * Ablauf je Lauf: Snapshot der Haupt-Datenbank schreiben → denselben Snapshot
 * in die Standby-Datenbank einspielen. Die beiden Datenbanken haben zu keinem
 * Zeitpunkt eine Verbindung zueinander.
 *
 * Der Job läuft ausdrücklich NICHT im Notbetrieb: dort wäre die Standby-DB die
 * führende Datenbank, und ein Sync würde sie mit einem veralteten Snapshot der
 * ausgefallenen Haupt-DB überschreiben.
 */

const DEFAULT_CRON = '0 * * * *'
const STALE_LOCK_MS = 30 * 60 * 1000

export type StandbySyncStatus = {
  startedAt: string
  finishedAt: string
  ok: boolean
  /** Stand des eingespielten Snapshots. */
  snapshotAt: string | null
  rows: number
  skippedModels: string[]
  error: string | null
}

let schedulerStarted = false

function statusFile() {
  return path.join(failoverStateDir(), 'standby-sync.json')
}

function lockFile() {
  return path.join(failoverStateDir(), 'standby-sync.lock')
}

export function readStandbySyncStatus(): StandbySyncStatus | null {
  try {
    return JSON.parse(fs.readFileSync(statusFile(), 'utf8')) as StandbySyncStatus
  } catch {
    return null
  }
}

function writeStandbySyncStatus(status: StandbySyncStatus) {
  try {
    fs.mkdirSync(failoverStateDir(), { recursive: true })
    fs.writeFileSync(statusFile(), JSON.stringify(status, null, 2), 'utf8')
  } catch (e) {
    console.error('[StandbySync] Status konnte nicht geschrieben werden:', e)
  }
}

/**
 * Einfacher Dateilock. Schützt gegen zwei Instanzen hinter einem Load
 * Balancer, die gleichzeitig denselben Standby überschreiben würden.
 */
function acquireLock(): boolean {
  const file = lockFile()
  try {
    fs.mkdirSync(failoverStateDir(), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: 'wx' })
    return true
  } catch {
    // Vorhandenes Lock: nur übernehmen, wenn es offensichtlich verwaist ist
    // (abgestürzter Prozess), sonst diesen Lauf auslassen.
    try {
      const age = Date.now() - fs.statSync(file).mtimeMs
      if (age < STALE_LOCK_MS) return false
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8')
      console.warn('[StandbySync] Verwaistes Lock übernommen.')
      return true
    } catch {
      return false
    }
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(lockFile())
  } catch {
    // Schon weg — kein Problem.
  }
}

export type SyncOutcome =
  | { ran: false; reason: string }
  | { ran: true; status: StandbySyncStatus }

/** Führt einen Sync sofort aus (auch vom Admin-Bereich aufrufbar). */
export async function runStandbySync(options: { force?: boolean } = {}): Promise<SyncOutcome> {
  const url = standbyUrl()
  if (!url) return { ran: false, reason: 'DATABASE_URL_STANDBY ist nicht gesetzt.' }
  if (activeMode() === 'standby' && !options.force) {
    return {
      ran: false,
      reason: 'Notbetrieb aktiv — ein Sync würde die gerade führende Standby-Datenbank überschreiben.',
    }
  }
  if (!acquireLock()) return { ran: false, reason: 'Ein Sync läuft bereits.' }

  const startedAt = new Date().toISOString()
  try {
    const backup = await runBackup({ source: 'primary' })
    const summary = await restoreSnapshot({ targetUrl: url, snapshotPath: backup.rotatedPath })
    const status: StandbySyncStatus = {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: summary.skippedModels.length === 0,
      snapshotAt: summary.exportedAt,
      rows: summary.totalRows,
      skippedModels: summary.skippedModels,
      error: null,
    }
    writeStandbySyncStatus(status)
    console.log(`[StandbySync] ${status.rows} Zeilen in die Standby-Datenbank gespiegelt.`)
    return { ran: true, status }
  } catch (e) {
    const status: StandbySyncStatus = {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: false,
      snapshotAt: null,
      rows: 0,
      skippedModels: [],
      error: e instanceof Error ? e.message : String(e),
    }
    writeStandbySyncStatus(status)
    console.error('[StandbySync] Sync fehlgeschlagen:', e)
    return { ran: true, status }
  } finally {
    releaseLock()
  }
}

/** Startet den wiederkehrenden Sync. Mehrfachaufrufe sind wirkungslos. */
export function ensureStandbySyncScheduler() {
  if (schedulerStarted) return
  if (!isFailoverConfigured()) return
  if (process.env.DB_STANDBY_SYNC_ENABLED?.trim().toLowerCase() === 'false') return

  const expression = process.env.DB_STANDBY_SYNC_CRON?.trim() || DEFAULT_CRON
  if (!cron.validate(expression)) {
    console.error(`[StandbySync] Ungültiger Cron-Ausdruck "${expression}" — Sync nicht gestartet.`)
    return
  }

  schedulerStarted = true
  cron.schedule(expression, () => {
    void runStandbySync().then((outcome) => {
      if (!outcome.ran) console.log(`[StandbySync] Übersprungen: ${outcome.reason}`)
    })
  })
  console.log(`[StandbySync] Zeitplan aktiv (${expression}).`)
}
