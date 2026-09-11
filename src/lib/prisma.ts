import { PrismaClient } from '@/generated/prisma/client'
import { activeClient } from './db-failover'

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
  changeSet: CompatDelegate
  changeset: CompatDelegate
  changeSetSnapshot: CompatDelegate
  changesetsnapshot: CompatDelegate
  changeSetTarget: CompatDelegate
  changesettarget: CompatDelegate
  changeSetEntry: CompatDelegate
  changesetentry: CompatDelegate
  rankChangeList: CompatDelegate
  rankchangelist: CompatDelegate
  rankChangeListEntry: CompatDelegate
  rankchangelistentry: CompatDelegate
  rankchangeentry: CompatDelegate
  rankChangeVote: CompatDelegate
  rankchangevote: CompatDelegate
  rankChangeEntryComment: CompatDelegate
  rankchangeentrycomment: CompatDelegate
  rankChangeEntryProposal: CompatDelegate
  rankchangeentryproposal: CompatDelegate
  rankChangeEntryHistory: CompatDelegate
  rankchangeentryhistory: CompatDelegate
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
  changeSet: 'changeset',
  changeset: 'changeSet',
  changeSetSnapshot: 'changesetsnapshot',
  changesetsnapshot: 'changeSetSnapshot',
  changeSetTarget: 'changesettarget',
  changesettarget: 'changeSetTarget',
  changeSetEntry: 'changesetentry',
  changesetentry: 'changeSetEntry',
  rankChangeList: 'rankchangelist',
  rankchangelist: 'rankChangeList',
  rankChangeListEntry: 'rankchangelistentry',
  rankchangelistentry: 'rankChangeListEntry',
  rankchangeentry: 'rankChangeListEntry',
  rankChangeVote: 'rankchangevote',
  rankchangevote: 'rankChangeVote',
  rankChangeEntryComment: 'rankchangeentrycomment',
  rankchangeentrycomment: 'rankChangeEntryComment',
  rankChangeEntryProposal: 'rankchangeentryproposal',
  rankchangeentryproposal: 'rankChangeEntryProposal',
  rankChangeEntryHistory: 'rankchangeentryhistory',
  rankchangeentryhistory: 'rankChangeEntryHistory',
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

// Je Client genau ein Kompatibilitäts-Proxy — sonst entstünde bei jedem
// Zugriff auf `prisma.*` ein neues Proxy-Objekt.
const compatCache = new WeakMap<PrismaClient, PrismaClientCompat>()

function compatClientFor(client: PrismaClient): PrismaClientCompat {
  const cached = compatCache.get(client)
  if (cached) return cached
  const created = createPrismaCompatClient(client)
  compatCache.set(client, created)
  return created
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

/**
 * Der im ganzen Code genutzte Zugang zur Datenbank.
 *
 * Welcher Client dahintersteht, entscheidet bei jedem Zugriff
 * `db-failover.ts`: im Normalbetrieb die Haupt-Datenbank, im Notbetrieb die
 * Standby-Datenbank. Für aufrufenden Code ändert sich dadurch nichts — auch
 * `$transaction` und die Fluent-API bleiben unverändert, weil das Umschalten
 * über eine Prisma-Erweiterung und nicht über einen Promise-Wrapper läuft.
 *
 * Bewusst lazy: eine noch nicht eingerichtete Installation muss Next bauen und
 * den Setup-/Health-Endpunkt ausliefern können. Erst der erste echte Zugriff
 * auf einen Delegate benötigt DATABASE_URL.
 */
export const prisma = new Proxy({} as PrismaClientCompat, {
  get(_target, prop) {
    const client = compatClientFor(activeClient())
    const value = Reflect.get(client, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
