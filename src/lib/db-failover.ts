import { Prisma, PrismaClient } from '@/generated/prisma/client'
import { createRawPrismaClient, createTrackedPrismaClient, intEnv } from './prisma-client-factory'
import { readFailoverState, writeFailoverState, type FailoverMode, type FailoverState } from './failover-state'

/**
 * Umschaltung zwischen Haupt- und Standby-Datenbank.
 *
 * Grundsatz: der Notbetrieb kommt ohne die Haupt-Datenbank aus. Der
 * Umschaltzustand liegt deshalb in einer Datei (siehe `failover-state.ts`),
 * das Schreib-Journal in der Standby-Datenbank selbst. Die beiden Datenbanken
 * sind nie miteinander verbunden — abgeglichen wird ausschließlich über die
 * JSON-Backups (siehe `standby-sync-job.ts` und `prisma/restore.ts`).
 */

export const MUTATION_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
])

/** Operationen, die wir vollständig aus dem Ergebnis rekonstruieren können. */
const RESULT_REWRITABLE = new Set(['create', 'update', 'upsert'])

/** Das Journal selbst wird nie journalisiert. */
const JOURNAL_MODEL_NAME = 'FailoverJournalEntry'

const globalForFailover = globalThis as unknown as {
  failoverPrimary?: PrismaClient
  failoverStandby?: PrismaClient
  failoverJournal?: PrismaClient
  failoverState?: FailoverState
  failoverConsecutiveErrors?: number
  failoverJournalBroken?: boolean
}

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

export function standbyUrl(): string | null {
  return process.env.DATABASE_URL_STANDBY?.trim() || null
}

/** Der ganze Mechanismus ist aus, solange keine zweite DB konfiguriert ist. */
export function isFailoverConfigured(): boolean {
  return standbyUrl() !== null
}

function errorThreshold(): number {
  return intEnv('DB_FAILOVER_ERROR_THRESHOLD', 3)
}

function automaticFailoverEnabled(): boolean {
  return process.env.DB_FAILOVER_AUTOMATIC?.trim().toLowerCase() !== 'false'
}

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

export function getState(): FailoverState {
  if (!globalForFailover.failoverState) {
    globalForFailover.failoverState = readFailoverState()
  }
  return globalForFailover.failoverState
}

function setState(state: FailoverState) {
  globalForFailover.failoverState = state
  writeFailoverState(state)
}

export function activeMode(): FailoverMode {
  if (!isFailoverConfigured()) return 'primary'
  return getState().mode
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/**
 * Failover-Verhalten als Prisma-Erweiterung statt als Funktions-Wrapper.
 *
 * Entscheidend, weil `$transaction([...])` echte PrismaPromises verlangt: ein
 * Wrapper, der eine gewöhnliche Promise zurückgibt, würde die 36 vorhandenen
 * Transaktionsaufrufe brechen. Eine Query-Erweiterung lässt die Promise-Art
 * unangetastet und greift auch innerhalb von Transaktionen.
 */
function withFailoverGuard(client: PrismaClient, role: FailoverMode): PrismaClient {
  return client.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (role === 'standby') {
          const result = await query(args)
          if (model && model !== JOURNAL_MODEL_NAME && MUTATION_OPERATIONS.has(operation)) {
            await writeJournalEntry(model, operation, args, result)
          }
          return result
        }

        try {
          const result = await query(args)
          noteSuccess()
          return result
        } catch (e) {
          if (!isConnectionError(e)) throw e
          if (!noteConnectionFailure(e)) throw e

          // Gerade in den Notbetrieb gewechselt: dieselbe Operation einmalig
          // auf der Standby-Datenbank wiederholen, damit die auslösende
          // Anfrage nicht trotzdem als Fehler beim Benutzer landet.
          if (!model) throw e
          return await operationOn(standbyClient(), model, operation)(args)
        }
      },
    },
  }) as unknown as PrismaClient
}

function primaryClient(): PrismaClient {
  if (!globalForFailover.failoverPrimary) {
    const url = process.env.DATABASE_URL?.trim()
    if (!url) {
      throw new Error(
        '[Prisma] DATABASE_URL fehlt oder ist leer. .env im Projektroot prüfen und den Node-Prozess neu starten.',
      )
    }
    const tracked = createTrackedPrismaClient(createRawPrismaClient(url, 'primary'))
    globalForFailover.failoverPrimary = isFailoverConfigured() ? withFailoverGuard(tracked, 'primary') : tracked
  }
  return globalForFailover.failoverPrimary
}

function standbyClient(): PrismaClient {
  if (!globalForFailover.failoverStandby) {
    const url = standbyUrl()
    if (!url) {
      throw new Error('[Prisma] DATABASE_URL_STANDBY fehlt — Notbetrieb ist nicht eingerichtet.')
    }
    globalForFailover.failoverStandby = withFailoverGuard(
      createTrackedPrismaClient(createRawPrismaClient(url, 'standby')),
      'standby',
    )
  }
  return globalForFailover.failoverStandby
}

/**
 * Eigener, kleiner Client für das Journal.
 *
 * Zwei Gründe für die Trennung: er trägt weder Journal- noch
 * Änderungs-Historie-Erweiterung (ein Journal-Eintrag darf keinen weiteren
 * Journal-Eintrag auslösen), und er hat einen eigenen Verbindungspool. Ohne
 * den eigenen Pool könnten im Notbetrieb alle Verbindungen von laufenden
 * Transaktionen belegt sein, während genau diese Transaktionen auf eine
 * Verbindung für ihren Journal-Eintrag warten — ein Deadlock.
 */
function journalClient(): PrismaClient {
  if (!globalForFailover.failoverJournal) {
    const url = standbyUrl()
    if (!url) throw new Error('[Prisma] DATABASE_URL_STANDBY fehlt — Notbetrieb ist nicht eingerichtet.')
    globalForFailover.failoverJournal = createRawPrismaClient(url, 'standby-journal', {
      connectionLimit: intEnv('DB_JOURNAL_CONNECTION_LIMIT', 4),
    })
  }
  return globalForFailover.failoverJournal
}

/** Der Client, auf den fachliche Zugriffe gerade laufen sollen. */
export function activeClient(): PrismaClient {
  return activeMode() === 'standby' ? standbyClient() : primaryClient()
}

/** Gezielt einer der beiden Clients — für Erreichbarkeitsprüfung und Abspielen. */
export function clientFor(mode: FailoverMode): PrismaClient {
  return mode === 'standby' ? standbyClient() : primaryClient()
}

// ---------------------------------------------------------------------------
// Fehlererkennung
// ---------------------------------------------------------------------------

/** Prisma-Fehlercodes, die eine nicht erreichbare Datenbank bedeuten. */
const CONNECTION_ERROR_CODES = new Set([
  'P1000', // Authentifizierung fehlgeschlagen
  'P1001', // Server nicht erreichbar
  'P1002', // Timeout beim Verbinden
  'P1008', // Operations-Timeout
  'P1010', // Zugriff verweigert
  'P1011', // TLS-Fehler
  'P1017', // Server hat die Verbindung geschlossen
  'P2024', // Pool-Timeout beim Holen einer Verbindung
])

const CONNECTION_ERROR_PATTERNS = [
  /econnrefused/i,
  /econnreset/i,
  /etimedout/i,
  /ehostunreach/i,
  /enotfound/i,
  /cannot connect/i,
  /can not connect/i,
  /connection.*(closed|lost|refused|timeout)/i,
  /pool timeout/i,
  /retrieve a connection from the pool/i,
  /server has gone away/i,
  /too many connections/i,
]

/**
 * Unterscheidet "Datenbank nicht erreichbar" von fachlichen Fehlern.
 *
 * Wichtig, damit ein doppelter Unique-Key (P2002) oder ein fehlender Datensatz
 * (P2025) niemals einen Notbetrieb auslöst.
 */
export function isConnectionError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false

  if (e instanceof Prisma.PrismaClientInitializationError) return true
  if (e instanceof Prisma.PrismaClientRustPanicError) return true

  const code = (e as { code?: unknown }).code
  if (typeof code === 'string') {
    if (CONNECTION_ERROR_CODES.has(code)) return true
    // mariadb-Treiberfehler tragen eigene Codes (ER_GET_CONNECTION_TIMEOUT …).
    if (/^(ER_GET_CONNECTION_TIMEOUT|ER_CONNECTION_|ECONN|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH)/i.test(code)) return true
  }

  const message = (e as { message?: unknown }).message
  if (typeof message === 'string' && CONNECTION_ERROR_PATTERNS.some((p) => p.test(message))) return true

  const cause = (e as { cause?: unknown }).cause
  return cause ? isConnectionError(cause) : false
}

// ---------------------------------------------------------------------------
// Umschalten
// ---------------------------------------------------------------------------

export function switchTo(mode: FailoverMode, reason: string, automatic: boolean): FailoverState {
  const state: FailoverState = { mode, since: new Date().toISOString(), reason, automatic }
  setState(state)
  globalForFailover.failoverConsecutiveErrors = 0
  console.warn(
    `[Failover] Umgeschaltet auf ${mode === 'standby' ? 'Standby-Datenbank (Notbetrieb)' : 'Haupt-Datenbank'} — ${reason}`,
  )
  return state
}

function noteSuccess() {
  globalForFailover.failoverConsecutiveErrors = 0
}

/**
 * Zählt Verbindungsfehler und schaltet bei Überschreiten der Schwelle um.
 * Rückgabe: true, wenn gerade in den Notbetrieb gewechselt wurde.
 */
function noteConnectionFailure(e: unknown): boolean {
  const count = (globalForFailover.failoverConsecutiveErrors ?? 0) + 1
  globalForFailover.failoverConsecutiveErrors = count

  if (!isFailoverConfigured() || !automaticFailoverEnabled()) return false
  if (activeMode() === 'standby') return false
  if (count < errorThreshold()) {
    console.warn(`[Failover] Verbindungsfehler ${count}/${errorThreshold()} zur Haupt-Datenbank.`)
    return false
  }

  const message = e instanceof Error ? e.message : String(e)
  switchTo('standby', `Automatisch nach ${count} Verbindungsfehlern: ${message}`.slice(0, 500), true)
  return true
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

type JournalDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>
}

function journalDelegate(client: PrismaClient): JournalDelegate {
  const record = client as unknown as Record<string, JournalDelegate | undefined>
  const delegate = record.failoverJournalEntry ?? record.failoverjournalentry
  if (!delegate) throw new Error('[Failover] Journal-Delegate nicht im Prisma-Client gefunden.')
  return delegate
}

/** Beziehungsfelder eines Modells — alles andere in `data` sind Skalare. */
function relationFields(modelName: string): Set<string> {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName)
  return new Set((model?.fields ?? []).filter((f) => f.kind === 'object').map((f) => f.name))
}

function hasNestedWrite(modelName: string, data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const relations = relationFields(modelName)
  return Object.keys(data as Record<string, unknown>).some((key) => relations.has(key))
}

/** Nur Skalare eines Ergebnis-Datensatzes (keine mitgeladenen Beziehungen). */
function scalarsOf(modelName: string, row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const relations = relationFields(modelName)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    if (relations.has(key)) continue
    out[key] = value
  }
  return Object.keys(out).length > 0 ? out : null
}

type JournalPayload = { args: unknown; exact: boolean }

/**
 * Baut aus Argumenten und Ergebnis den Eintrag, der später abgespielt wird.
 *
 * Für `create`/`update`/`upsert` wird das tatsächliche Ergebnis verwendet: so
 * landet die im Notbetrieb erzeugte ID unverändert in der Haupt-Datenbank und
 * spätere Journal-Einträge, die sich darauf beziehen, passen weiterhin.
 */
export function buildJournalPayload(
  modelName: string,
  operation: string,
  args: unknown,
  result: unknown,
): JournalPayload {
  const argsRecord = (args ?? {}) as Record<string, unknown>

  if (RESULT_REWRITABLE.has(operation)) {
    const scalars = scalarsOf(modelName, result)
    if (scalars) {
      if (operation === 'create') return { args: { data: scalars }, exact: true }
      if (operation === 'update') return { args: { where: argsRecord.where, data: scalars }, exact: true }
      // upsert: mit vollständigen Skalaren ist der Eintrag idempotent abspielbar.
      return { args: { where: argsRecord.where, create: scalars, update: scalars }, exact: true }
    }
    return { args: argsRecord, exact: !hasNestedWrite(modelName, argsRecord.data) }
  }

  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const rows = argsRecord.data
    // Ohne explizite IDs erzeugt das Abspielen neue IDs — das muss sichtbar sein.
    const allHaveIds =
      Array.isArray(rows) &&
      rows.length > 0 &&
      rows.every((row) => !!row && typeof row === 'object' && 'id' in (row as Record<string, unknown>))
    return { args: argsRecord, exact: allHaveIds }
  }

  // delete / deleteMany / updateMany: `where` gilt in beiden Datenbanken gleich.
  return { args: argsRecord, exact: true }
}

/**
 * Schreibt einen Journal-Eintrag. Schlägt das fehl, wäre die Änderung beim
 * Zurückspielen verloren — deshalb laut protokollieren und den Zustand merken,
 * statt den Fehler zu verschlucken.
 */
async function writeJournalEntry(modelName: string, operation: string, args: unknown, result: unknown) {
  const payload = buildJournalPayload(modelName, operation, args, result)
  try {
    await journalDelegate(journalClient()).create({
      data: {
        model: modelName,
        operation,
        args: JSON.parse(JSON.stringify(payload.args ?? {})),
        exact: payload.exact,
      },
    })
  } catch (e) {
    globalForFailover.failoverJournalBroken = true
    console.error(
      `[Failover] Journal-Eintrag für ${modelName}.${operation} konnte NICHT geschrieben werden — diese Änderung wird beim Zurückspielen fehlen.`,
      e,
    )
  }
}

export function isJournalBroken(): boolean {
  return globalForFailover.failoverJournalBroken === true
}

// ---------------------------------------------------------------------------
// Erreichbarkeit & Journal-Abspielen
// ---------------------------------------------------------------------------

export async function pingDatabase(mode: FailoverMode): Promise<{ ok: boolean; error?: string }> {
  if (mode === 'standby' && !isFailoverConfigured()) {
    return { ok: false, error: 'DATABASE_URL_STANDBY ist nicht gesetzt.' }
  }
  try {
    await clientFor(mode).$queryRaw`SELECT 1`
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export type JournalEntryRow = {
  seq: number
  model: string
  operation: string
  args: unknown
  createdAt: Date
  appliedAt: Date | null
  error: string | null
  exact: boolean
  skipped: boolean
}

type JournalQueryDelegate = {
  findMany: (args?: unknown) => Promise<JournalEntryRow[]>
  count: (args?: unknown) => Promise<number>
  update: (args: unknown) => Promise<unknown>
  updateMany: (args: unknown) => Promise<{ count: number }>
  deleteMany: (args?: unknown) => Promise<{ count: number }>
}

export function journalQuery(client: PrismaClient = journalClient()): JournalQueryDelegate {
  const record = client as unknown as Record<string, JournalQueryDelegate | undefined>
  const delegate = record.failoverJournalEntry ?? record.failoverjournalentry
  if (!delegate) throw new Error('[Failover] Journal-Delegate nicht im Prisma-Client gefunden.')
  return delegate
}

/** Noch nicht in die Haupt-DB übernommene, nicht übersprungene Einträge. */
export async function openJournalCount(): Promise<number> {
  if (!isFailoverConfigured()) return 0
  try {
    return await journalQuery().count({ where: { appliedAt: null, skipped: false } })
  } catch {
    return 0
  }
}

export type ReplayResult = {
  applied: number
  failed: number
  remaining: number
  failures: { seq: number; model: string; operation: string; error: string }[]
}

function operationOn(client: PrismaClient, modelName: string, operation: string) {
  const record = client as unknown as Record<string, Record<string, unknown> | undefined>
  const delegate =
    record[modelName.charAt(0).toLowerCase() + modelName.slice(1)] ?? record[modelName.toLowerCase()]
  const fn = delegate?.[operation]
  if (typeof fn !== 'function') {
    throw new Error(`Operation ${modelName}.${operation} existiert im Prisma-Client nicht.`)
  }
  return (args: unknown) => (fn as (a: unknown) => Promise<unknown>).call(delegate, args)
}

/**
 * Spielt das Journal der Reihe nach gegen die Haupt-Datenbank ab.
 *
 * Ein fehlgeschlagener Eintrag hält die übrigen nicht auf: er wird mit seiner
 * Fehlermeldung markiert und im Admin-Bereich aufgelistet. Erst wenn nichts
 * mehr offen ist, lässt sich zurückschalten.
 */
export async function replayJournal(): Promise<ReplayResult> {
  const journal = journalQuery()
  const target = primaryClient()
  const entries = await journal.findMany({
    where: { appliedAt: null, skipped: false },
    orderBy: { seq: 'asc' },
  })

  const failures: ReplayResult['failures'] = []
  let applied = 0

  for (const entry of entries) {
    try {
      await operationOn(target, entry.model, entry.operation)(entry.args)
      await journal.update({ where: { seq: entry.seq }, data: { appliedAt: new Date(), error: null } })
      applied += 1
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      failures.push({ seq: entry.seq, model: entry.model, operation: entry.operation, error: message })
      await journal.update({ where: { seq: entry.seq }, data: { error: message.slice(0, 4000) } }).catch(() => {})
    }
  }

  return {
    applied,
    failed: failures.length,
    remaining: await journal.count({ where: { appliedAt: null, skipped: false } }),
    failures,
  }
}
