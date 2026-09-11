import { PrismaClient } from '@/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { completeMutationCapture, prepareMutationCapture, type SnapshotClient } from './change-history-tracking'

/**
 * Erzeugung einzelner Prisma-Clients.
 *
 * Aus `prisma.ts` herausgelöst, weil es seit dem Failover zwei Clients gibt
 * (Haupt- und Standby-Datenbank), die beide dieselbe Pool-Konfiguration und
 * dieselbe Change-History-Erweiterung brauchen. `prisma.ts` enthält nur noch
 * den nach außen sichtbaren Proxy, `db-failover.ts` die Umschaltlogik.
 */

export function intEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Baut eine explizite mariadb-Pool-Konfiguration aus einer Verbindungs-URL.
 *
 * Der Adapter-Default ist `connectionLimit=10`, was für ein Dashboard mit
 * mehreren pollenden Endpunkten + Hintergrund-Sync (bis zu 8 parallele
 * Verbindungen) zu knapp ist → Pool-Timeouts. Größe und Acquire-Timeout sind
 * per Env steuerbar; `acquireTimeout` sorgt außerdem für schnelles
 * Fehlschlagen statt minutenlangem Hängen.
 */
export function buildPoolConfig(url: string, overrides: { connectionLimit?: number } = {}) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    connectionLimit: overrides.connectionLimit ?? intEnv('DB_CONNECTION_LIMIT', 15),
    acquireTimeout: intEnv('DB_POOL_ACQUIRE_TIMEOUT_MS', 12_000),
  }
}

/** Roher Client auf eine konkrete Verbindungs-URL, inklusive Slow-Query-Warnungen. */
export function createRawPrismaClient(
  url: string,
  label: string,
  overrides: { connectionLimit?: number } = {},
): PrismaClient {
  const adapter = new PrismaMariaDb(buildPoolConfig(url, overrides))
  const client = new PrismaClient({
    adapter,
    log: [{ emit: 'event', level: 'query' }, { emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }],
  })

  // Slow-Query-Diagnose: hilft, einen echten Verbindungs-Leak (eine Query
  // hängt lange und hält ihre Connection) von reiner Contention zu unterscheiden.
  const slowMs = intEnv('DB_SLOW_QUERY_MS', 1_500)
  try {
    // Das Query-Event ist nur typisiert, wenn `log` es enthält (tut es oben).
    ;(client as unknown as { $on: (e: 'query', cb: (ev: { duration: number; query: string }) => void) => void }).$on(
      'query',
      (event) => {
        if (event.duration >= slowMs) {
          console.warn(`[Prisma][slow-query][${label}] ${event.duration}ms :: ${event.query}`)
        }
      },
    )
  } catch {
    // Query-Logging ist optional — Fehler hier dürfen den Client nicht blockieren.
  }

  return client
}

/** Hängt die Änderungs-Historie an einen Client. */
export function createTrackedPrismaClient(baseClient: PrismaClient): PrismaClient {
  const snapshotClient = baseClient as unknown as SnapshotClient
  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const capture = await prepareMutationCapture({
            client: snapshotClient,
            model,
            operation,
            args,
          })
          const result = await query(args)
          await completeMutationCapture(snapshotClient, capture, result)
          return result
        },
      },
    },
  }) as unknown as PrismaClient
}
