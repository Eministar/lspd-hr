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
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaCompat: PrismaClientCompat | undefined
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error(
      '[Prisma] DATABASE_URL fehlt oder ist leer. .env im Projektroot prüfen und den Node-Prozess neu starten.',
    )
  }
  const adapter = new PrismaMariaDb(url)
  return new PrismaClient({ adapter })
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
