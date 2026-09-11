import fs from 'node:fs'
import path from 'node:path'

/**
 * Persistenter Umschaltzustand — bewusst als Datei, nicht in einer Datenbank.
 *
 * Der Notbetrieb muss vollständig ohne die Haupt-Datenbank funktionieren.
 * Läge der Zustand dort, könnte ein Neustart während des Ausfalls nicht
 * herausfinden, dass er im Notbetrieb weiterlaufen soll. In der Standby-DB
 * wäre er ebenso falsch aufgehoben: im Normalbetrieb wird die Standby-DB vom
 * Sync komplett überschrieben.
 */

export type FailoverMode = 'primary' | 'standby'

export type FailoverState = {
  mode: FailoverMode
  /** Zeitpunkt der letzten Umschaltung (ISO-8601). */
  since: string
  /** Klartext-Begründung, wird im Admin-Bereich angezeigt. */
  reason: string
  /** true = automatisch umgeschaltet, false = per Hand. */
  automatic: boolean
}

const DEFAULT_STATE: FailoverState = {
  mode: 'primary',
  since: new Date(0).toISOString(),
  reason: 'Normalbetrieb',
  automatic: false,
}

export function failoverStateDir(): string {
  return process.env.FAILOVER_STATE_DIR?.trim() || path.join(process.cwd(), '.failover')
}

function stateFile(): string {
  return path.join(failoverStateDir(), 'state.json')
}

function isMode(value: unknown): value is FailoverMode {
  return value === 'primary' || value === 'standby'
}

/**
 * Liest den Zustand synchron.
 *
 * Synchron, weil der Client-Router bei jedem Zugriff wissen muss, welcher
 * Client gilt, und das Ergebnis im Prozess zwischengespeichert wird — die
 * Datei wird also nicht pro Anfrage angefasst.
 */
export function readFailoverState(): FailoverState {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<FailoverState>
    if (!isMode(parsed.mode)) return DEFAULT_STATE
    return {
      mode: parsed.mode,
      since: typeof parsed.since === 'string' ? parsed.since : new Date().toISOString(),
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      automatic: parsed.automatic === true,
    }
  } catch {
    // Fehlende oder kaputte Datei bedeutet Normalbetrieb — niemals ein Grund,
    // die App nicht starten zu lassen.
    return DEFAULT_STATE
  }
}

export function writeFailoverState(state: FailoverState): void {
  const dir = failoverStateDir()
  fs.mkdirSync(dir, { recursive: true })
  // Erst in eine Nebendatei schreiben, dann umbenennen: ein Absturz mitten im
  // Schreiben darf keinen halben Zustand hinterlassen.
  const tmp = path.join(dir, `state.json.tmp-${process.pid}`)
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
  fs.renameSync(tmp, stateFile())
}
