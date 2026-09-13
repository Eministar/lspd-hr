import fs from 'node:fs/promises'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { DATA_MODEL_NAMES, JOURNAL_MODEL, resolveDelegate, tableName } from './db-models'
import { verifyBackup } from './backup-verify'

/**
 * Spielt einen JSON-Snapshot in eine Datenbank ein.
 *
 * Das ist die einzige Verbindung zwischen Haupt- und Standby-Datenbank: es
 * gibt keine Replikation, keinen gemeinsamen Server, keine gegenseitigen
 * Abfragen — nur diese Datei liest, was `prisma/backup.ts` geschrieben hat.
 *
 * Die Fremdschlüsselprüfung wird für die Dauer des Einspielens abgeschaltet.
 * Dadurch ist die Reihenfolge der Tabellen egal, was eine handgepflegte
 * topologische Sortierung über 68 Modelle erspart. Damit das zuverlässig
 * funktioniert, läuft der Restore-Client mit einem Pool von genau einer
 * Verbindung — `SET FOREIGN_KEY_CHECKS` gilt nur für die eigene Sitzung.
 */

const CHUNK_SIZE = 500

/** Schlüssel des alten Snapshot-Formats (formatVersion 1) auf Modellnamen. */
const LEGACY_KEYS: Record<string, string> = {
  userGroups: 'UserGroup',
  users: 'User',
  units: 'Unit',
  ranks: 'Rank',
  trainings: 'Training',
  officers: 'Officer',
  officerTrainings: 'OfficerTraining',
  dutyTimeSessions: 'DutyTimeSession',
  playtimeSessions: 'PlaytimeSession',
  absenceNotices: 'AbsenceNotice',
  promotionLogs: 'PromotionLog',
  terminations: 'Termination',
  notes: 'Note',
  auditLogs: 'AuditLog',
  changeSets: 'ChangeSet',
  changeSetSnapshots: 'ChangeSetSnapshot',
  changeSetTargets: 'ChangeSetTarget',
  changeSetEntries: 'ChangeSetEntry',
  rankChangeLists: 'RankChangeList',
  rankChangeListEntries: 'RankChangeListEntry',
  rankChangeVotes: 'RankChangeVote',
  rankChangeEntryComments: 'RankChangeEntryComment',
  rankChangeEntryProposals: 'RankChangeEntryProposal',
  rankChangeEntryHistory: 'RankChangeEntryHistory',
  systemSettings: 'SystemSetting',
  taskLists: 'TaskList',
  tasks: 'Task',
  taskAssignments: 'TaskAssignment',
  patrolBoards: 'PatrolBoard',
  patrolUnits: 'PatrolUnit',
  patrolAssignments: 'PatrolAssignment',
  badgeBlacklists: 'BadgeBlacklist',
}

export type RestoreSummary = {
  snapshotPath: string
  exportedAt: string | null
  inserted: Record<string, number>
  skippedModels: string[]
  totalRows: number
}

export function normalizeSnapshot(raw: unknown, includeJournal = false): { exportedAt: string | null; data: Record<string, unknown[]> } {
  const snapshot = raw as { meta?: { exportedAt?: string; formatVersion?: number }; data?: Record<string, unknown> }
  const source = snapshot?.data
  if (!source || typeof source !== 'object') {
    throw new Error('Snapshot enthält kein "data"-Objekt — Datei unbrauchbar.')
  }

  const known = new Set(includeJournal ? [...DATA_MODEL_NAMES, JOURNAL_MODEL] : DATA_MODEL_NAMES)
  const data: Record<string, unknown[]> = {}

  for (const [key, value] of Object.entries(source)) {
    if (!Array.isArray(value)) continue
    const modelName = known.has(key) ? key : LEGACY_KEYS[key]
    if (!modelName || !known.has(modelName)) continue
    data[modelName] = value
  }

  return { exportedAt: snapshot?.meta?.exportedAt ?? null, data }
}

function poolConfigFor(url: string) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    // Genau eine Verbindung: SET FOREIGN_KEY_CHECKS gilt sitzungsweise, bei
    // mehreren Pool-Verbindungen liefe ein Teil der Inserts sonst mit Prüfung.
    connectionLimit: 1,
  }
}

export async function restoreSnapshot(options: {
  targetUrl: string
  snapshotPath: string
  includeJournal?: boolean
}): Promise<RestoreSummary> {
  const raw = JSON.parse(await fs.readFile(options.snapshotPath, 'utf8'))
  if (raw.meta?.formatVersion === 3) await verifyBackup(options.snapshotPath)
  const { exportedAt, data } = normalizeSnapshot(raw, options.includeJournal)
  const models = options.includeJournal ? [...DATA_MODEL_NAMES, JOURNAL_MODEL] : DATA_MODEL_NAMES

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(poolConfigFor(options.targetUrl)) })
  const inserted: Record<string, number> = {}
  const skippedModels: string[] = []

  try {
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')

    // Erst alles leeren, dann füllen: ein Datensatz, der im Snapshot nicht
    // mehr vorkommt (gelöscht), darf im Ziel nicht überleben.
    for (const modelName of models) {
      const delegate = resolveDelegate<{ deleteMany: (a?: unknown) => Promise<{ count: number }> }>(prisma, modelName)
      if (!delegate) continue
      try {
        await delegate.deleteMany({})
      } catch (e) {
        // Tabelle fehlt im Ziel (Schema noch nicht gepusht) — benennen, nicht abbrechen.
        console.warn(`Leeren von ${tableName(modelName)} übersprungen: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    for (const modelName of models) {
      const rows = data[modelName]
      if (!rows || rows.length === 0) {
        inserted[modelName] = 0
        continue
      }

      const delegate = resolveDelegate<{
        createMany: (a: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }>
      }>(prisma, modelName)
      if (!delegate) {
        skippedModels.push(modelName)
        continue
      }

      let count = 0
      try {
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE)
          const result = await delegate.createMany({ data: chunk, skipDuplicates: true })
          count += result.count
        }
      } catch (e) {
        skippedModels.push(modelName)
        console.error(
          `Einspielen von ${tableName(modelName)} fehlgeschlagen (${e instanceof Error ? e.message : String(e)}).`,
        )
      }
      inserted[modelName] = count
    }
  } finally {
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1').catch(() => {})
    await prisma.$disconnect()
  }

  return {
    snapshotPath: options.snapshotPath,
    exportedAt,
    inserted,
    skippedModels,
    totalRows: Object.values(inserted).reduce((sum, n) => sum + n, 0),
  }
}
