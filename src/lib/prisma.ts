import { PrismaClient } from '@/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

// Server können je nach generiertem Prisma-Client camelCase oder lowercase Delegates typisieren.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CompatDelegate = Record<string, (...args: any[]) => any>

type PrismaClientCompat = PrismaClient & {
  userGroup: CompatDelegate
  usergroup: CompatDelegate
  officerTraining: CompatDelegate
  officertraining: CompatDelegate
  promotionLog: CompatDelegate
  promotionlog: CompatDelegate
  auditLog: CompatDelegate
  auditlog: CompatDelegate
  rankChangeList: CompatDelegate
  rankchangelist: CompatDelegate
  rankChangeListEntry: CompatDelegate
  rankchangelistentry: CompatDelegate
  rankchangeentry: CompatDelegate
  systemSetting: CompatDelegate
  systemsetting: CompatDelegate
  taskList: CompatDelegate
  tasklist: CompatDelegate
  taskAssignment: CompatDelegate
  taskassignment: CompatDelegate
  patrolBoard: CompatDelegate
  patrolboard: CompatDelegate
  patrolUnit: CompatDelegate
  patrolunit: CompatDelegate
  patrolAssignment: CompatDelegate
  patrolassignment: CompatDelegate
  sruFolder: CompatDelegate
  srufolder: CompatDelegate
  sruDocument: CompatDelegate
  srudocument: CompatDelegate
  formTest: CompatDelegate
  formtest: CompatDelegate
  formQuestion: CompatDelegate
  formquestion: CompatDelegate
  formResponse: CompatDelegate
  formresponse: CompatDelegate
  formAnswer: CompatDelegate
  formanswer: CompatDelegate
  formTestSession: CompatDelegate
  formtestsession: CompatDelegate
  probationEntry: CompatDelegate
  probationentry: CompatDelegate
}

const delegateAliases: Record<string, string> = {
  userGroup: 'usergroup',
  usergroup: 'userGroup',
  officerTraining: 'officertraining',
  officertraining: 'officerTraining',
  promotionLog: 'promotionlog',
  promotionlog: 'promotionLog',
  auditLog: 'auditlog',
  auditlog: 'auditLog',
  rankChangeList: 'rankchangelist',
  rankchangelist: 'rankChangeList',
  rankChangeListEntry: 'rankchangelistentry',
  rankchangelistentry: 'rankChangeListEntry',
  rankchangeentry: 'rankChangeListEntry',
  systemSetting: 'systemsetting',
  systemsetting: 'systemSetting',
  taskList: 'tasklist',
  tasklist: 'taskList',
  taskAssignment: 'taskassignment',
  taskassignment: 'taskAssignment',
  patrolBoard: 'patrolboard',
  patrolboard: 'patrolBoard',
  patrolUnit: 'patrolunit',
  patrolunit: 'patrolUnit',
  patrolAssignment: 'patrolassignment',
  patrolassignment: 'patrolAssignment',
  sruFolder: 'srufolder',
  srufolder: 'sruFolder',
  sruDocument: 'srudocument',
  srudocument: 'sruDocument',
  formTest: 'formtest',
  formtest: 'formTest',
  formQuestion: 'formquestion',
  formquestion: 'formQuestion',
  formResponse: 'formresponse',
  formresponse: 'formResponse',
  formAnswer: 'formanswer',
  formanswer: 'formAnswer',
  formTestSession: 'formtestsession',
  formtestsession: 'formTestSession',
  probationEntry: 'probationentry',
  probationentry: 'probationEntry',
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaCompat: PrismaClientCompat | undefined
}

function intEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Baut eine explizite mariadb-Pool-Konfiguration aus der DATABASE_URL.
 *
 * Der Adapter-Default ist `connectionLimit=10`, was für ein Dashboard mit
 * mehreren pollenden Endpunkten + Hintergrund-Sync (bis zu 8 parallele
 * Verbindungen) zu knapp ist → Pool-Timeouts. Größe und Acquire-Timeout sind
 * jetzt per Env steuerbar; `acquireTimeout` sorgt außerdem für schnelles
 * Fehlschlagen statt minutenlangem Hängen.
 */
function buildPoolConfig(url: string) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    connectionLimit: intEnv('DB_CONNECTION_LIMIT', 15),
    acquireTimeout: intEnv('DB_POOL_ACQUIRE_TIMEOUT_MS', 12_000),
  }
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error(
      '[Prisma] DATABASE_URL fehlt oder ist leer. .env im Projektroot prüfen und den Node-Prozess neu starten.',
    )
  }
  const adapter = new PrismaMariaDb(buildPoolConfig(url))
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
          console.warn(`[Prisma][slow-query] ${event.duration}ms :: ${event.query}`)
        }
      },
    )
  } catch {
    // Query-Logging ist optional — Fehler hier dürfen den Client nicht blockieren.
  }

  return client
}

function createPrismaCompatClient(client: PrismaClient): PrismaClientCompat {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !(prop in target)) {
        const alias = delegateAliases[prop]
        if (alias && alias in target) return Reflect.get(target, alias, receiver)
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as PrismaClientCompat
}

/** Ein Client pro Node-Prozess (auch in Production), damit keine Verbindungsfluten entstehen. */
const prismaClient = globalForPrisma.prisma ?? (globalForPrisma.prisma = createPrismaClient())
export const prisma =
  globalForPrisma.prismaCompat ?? (globalForPrisma.prismaCompat = createPrismaCompatClient(prismaClient))
