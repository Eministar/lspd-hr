import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import type { OfficerFlag, OfficerStatus } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { isRecordChangedError } from '@/lib/prisma-errors'

export const INACTIVITY_DAYS = 7
const AUTOMATION_INTERVAL_MS = 60_000
const SYSTEM_USERNAME = 'lspd-system'
const SYSTEM_DISPLAY_NAME = 'LSPD System'
const STATUS_UPDATE_ATTEMPTS = 3

export interface OfficerStatusAutomationResult {
  skipped: boolean
  updated: number
  notesCreated: number
}
export const SYSTEM_NOTE_TITLE = 'Automatische Fehlzeit-Markierung'
export const INACTIVITY_NOTE_DISMISSED_ACTION = 'INACTIVITY_NOTE_DISMISSED'

let lastAutomationRun = 0
let automationInFlight: Promise<OfficerStatusAutomationResult> | null = null

async function updateOfficerStatusSafely(input: {
  id: string
  status: OfficerStatus
  flag: OfficerFlag | null
  nextStatus: OfficerStatus
  nextFlag: OfficerFlag | null
}) {
  let lastError: unknown
  for (let attempt = 1; attempt <= STATUS_UPDATE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.officer.updateMany({
        where: { id: input.id, status: input.status, flag: input.flag },
        data: { status: input.nextStatus, flag: input.nextFlag },
      })
    } catch (error) {
      lastError = error
      if (!isRecordChangedError(error) || attempt === STATUS_UPDATE_ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt))
    }
  }
  throw lastError
}

export function parseAbsenceDate(value: string, fallbackTime?: { hours: number; minutes: number }) {
  const input = value.trim()
  if (!input) return null

  const dateOnly = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    const year = Number.parseInt(dateOnly[1], 10)
    const month = Number.parseInt(dateOnly[2], 10) - 1
    const day = Number.parseInt(dateOnly[3], 10)
    const date = new Date(year, month, day, fallbackTime?.hours ?? 0, fallbackTime?.minutes ?? 0, 0, 0)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const iso = new Date(input)
  if (!Number.isNaN(iso.getTime())) return iso

  const match = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (!match) return null

  const day = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10) - 1
  const year = Number.parseInt(match[3], 10)
  const hours = match[4] ? Number.parseInt(match[4], 10) : fallbackTime?.hours ?? 0
  const minutes = match[5] ? Number.parseInt(match[5], 10) : fallbackTime?.minutes ?? 0
  const date = new Date(year, month, day, hours, minutes, 0, 0)

  return Number.isNaN(date.getTime()) ? null : date
}

export function formatAbsenceDate(date: Date) {
  return date.toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  })
}

function latestDate(...dates: Array<Date | null | undefined>) {
  return dates
    .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
}

async function systemUserId() {
  const existing = await prisma.user.findUnique({
    where: { username: SYSTEM_USERNAME },
    select: { id: true },
  })
  if (existing) return existing.id

  const passwordHash = await bcrypt.hash(crypto.randomUUID(), 12)
  const user = await prisma.user.upsert({
    where: { username: SYSTEM_USERNAME },
    update: { displayName: SYSTEM_DISPLAY_NAME },
    create: {
      username: SYSTEM_USERNAME,
      passwordHash,
      displayName: SYSTEM_DISPLAY_NAME,
      role: 'READONLY',
      permissions: [],
    },
    select: { id: true },
  })
  return user.id
}

export async function createAbsenceNotice(input: {
  officerId: string
  startsAt: Date
  endsAt: Date
  reason: string
  source: 'discord' | 'dashboard'
  actorDiscordId?: string | null
}) {
  if (input.endsAt <= input.startsAt) {
    throw new Error('Ende muss nach dem Start liegen.')
  }

  const officer = await prisma.officer.findUnique({
    where: { id: input.officerId },
    include: { rank: true },
  })
  if (!officer) throw new Error('Officer wurde nicht gefunden.')
  if (officer.status === 'TERMINATED') throw new Error('Gekündigte Officers können nicht abgemeldet werden.')

  const reason = input.reason.trim()
  if (!reason) throw new Error('Grund ist erforderlich.')

  const overlapping = await prisma.absenceNotice.findFirst({
    where: {
      officerId: input.officerId,
      startsAt: { lte: input.endsAt },
      endsAt: { gte: input.startsAt },
    },
    orderBy: { endsAt: 'desc' },
  })
  const absence = overlapping
    ? await prisma.absenceNotice.update({
      where: { id: overlapping.id },
      data: {
        startsAt: overlapping.startsAt < input.startsAt ? overlapping.startsAt : input.startsAt,
        endsAt: input.endsAt,
        reason,
        source: input.source,
        actorDiscordId: input.actorDiscordId ?? null,
      },
    })
    : await prisma.absenceNotice.create({
      data: {
        officerId: input.officerId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason,
        source: input.source,
        actorDiscordId: input.actorDiscordId ?? null,
      },
    })

  await runOfficerStatusAutomation({ force: true })
  return { officer, absence }
}

export async function cancelAbsenceNotice(absenceId: string) {
  const absence = await prisma.absenceNotice.findUnique({
    where: { id: absenceId },
    include: {
      officer: { include: { rank: true } },
    },
  })
  if (!absence) throw new Error('Abmeldung wurde nicht gefunden.')

  const endedAt = new Date()
  const safeEndedAt = endedAt <= absence.startsAt ? new Date(absence.startsAt.getTime() + 1000) : endedAt
  const updated = await prisma.absenceNotice.update({
    where: { id: absenceId },
    data: { endsAt: safeEndedAt },
    include: {
      officer: { include: { rank: true } },
    },
  })
  await runOfficerStatusAutomation({ force: true })
  return updated
}

export async function endActiveAbsencesForOfficer(officerId: string | null | undefined, endedAt = new Date()) {
  if (!officerId) return 0
  const result = await prisma.absenceNotice.updateMany({
    where: {
      officerId,
      startsAt: { lte: endedAt },
      endsAt: { gte: endedAt },
    },
    data: { endsAt: endedAt },
  })
  return result.count
}

export async function getActiveAbsenceNotices(now = new Date()) {
  return prisma.absenceNotice.findMany({
    where: {
      startsAt: { lte: now },
      endsAt: { gte: now },
      officer: { status: { not: 'TERMINATED' } },
    },
    include: {
      officer: {
        select: {
          id: true,
          badgeNumber: true,
          firstName: true,
          lastName: true,
          discordId: true,
          rank: { select: { name: true, color: true, sortOrder: true } },
        },
      },
    },
    orderBy: [{ endsAt: 'asc' }, { startsAt: 'asc' }],
  })
}

export async function getOfficerAbsenceReport(officerId: string, now = new Date()) {
  const notices = await prisma.absenceNotice.findMany({
    where: {
      officerId,
      endsAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { startsAt: 'desc' },
    take: 12,
  })

  return {
    active: notices.find((notice) => notice.startsAt <= now && notice.endsAt >= now) ?? null,
    upcoming: notices.filter((notice) => notice.startsAt > now).slice(0, 5),
    recent: notices,
  }
}

/**
 * Verhindert überlappende Statusläufe innerhalb eines Node-Prozesses. Das ist
 * wichtig, weil Dashboard-Polling, Player-Sync und Discord-Abmeldungen dieselbe
 * Officer-Tabelle nahezu gleichzeitig anstoßen können.
 */
export async function runOfficerStatusAutomation(options?: { force?: boolean }): Promise<OfficerStatusAutomationResult> {
  if (automationInFlight) return automationInFlight

  const run = runOfficerStatusAutomationPass(options)
  automationInFlight = run
  try {
    return await run
  } finally {
    if (automationInFlight === run) automationInFlight = null
  }
}

async function runOfficerStatusAutomationPass(options?: { force?: boolean }): Promise<OfficerStatusAutomationResult> {
  const now = new Date()
  if (!options?.force && now.getTime() - lastAutomationRun < AUTOMATION_INTERVAL_MS) {
    return { skipped: true, updated: 0, notesCreated: 0 }
  }
  lastAutomationRun = now.getTime()

  const inactiveCutoff = new Date(now.getTime() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000)
  const officers = await prisma.officer.findMany({
    where: { status: { not: 'TERMINATED' } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      badgeNumber: true,
      status: true,
      flag: true,
      lastOnline: true,
      createdAt: true,
      hireDate: true,
      playtimeSessions: {
        orderBy: { lastSeenAt: 'desc' },
        take: 1,
        select: { lastSeenAt: true },
      },
      officerNotes: {
        where: { title: SYSTEM_NOTE_TITLE },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
      auditLogs: {
        where: { action: INACTIVITY_NOTE_DISMISSED_ACTION },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
      absenceNotices: {
        where: {
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        select: { id: true },
        take: 1,
      },
    },
  })

  let updated = 0
  let notesCreated = 0
  let systemAuthorId: string | null = null

  for (const officer of officers) {
    const hasActiveAbsence = officer.absenceNotices.length > 0
    const latestPlaytime = officer.playtimeSessions[0]
    const lastActivity = latestPlaytime?.lastSeenAt ?? officer.lastOnline ?? latestDate(officer.hireDate, officer.createdAt) ?? officer.createdAt
    const isInactive = lastActivity < inactiveCutoff
    const nextStatus = hasActiveAbsence ? 'AWAY' : isInactive ? 'INACTIVE' : 'ACTIVE'
    const nextFlag = hasActiveAbsence
      ? 'BLUE'
      : isInactive
        ? 'YELLOW'
        : officer.flag === 'BLUE' || officer.flag === 'YELLOW'
          ? null
          : officer.flag

    if (!hasActiveAbsence && isInactive) {
      const alreadyNoted = officer.officerNotes.some((note) => note.createdAt >= lastActivity)
      const alreadyDismissed = officer.auditLogs.some((log) => log.createdAt >= lastActivity)
      if (!alreadyNoted && !alreadyDismissed) {
        systemAuthorId ??= await systemUserId()
        await prisma.note.create({
          data: {
            officerId: officer.id,
            authorId: systemAuthorId,
            title: SYSTEM_NOTE_TITLE,
            content: `Keine Abmeldung und keine Aktivität seit ${formatAbsenceDate(lastActivity)}. Der Officer wurde nach ${INACTIVITY_DAYS} Tagen Fehlzeit automatisch gelb markiert.`,
            pinned: false,
          },
        })
        notesCreated++
      }
    }

    if (officer.status !== nextStatus || officer.flag !== nextFlag) {
      // Die Statusautomatik läuft parallel zu Discord-/Dashboard-Schreibvorgängen.
      // updateMany vermeidet das RETURNING-Read von `update`, das MariaDB bei
      // aktivierter innodb_snapshot_isolation mit ER_CHECKREAD ablehnen kann.
      // Die alten Werte im WHERE schützen außerdem vor dem Überschreiben eines
      // zwischenzeitlich geänderten Officer-Datensatzes.
      let result: { count: number }
      try {
        result = await updateOfficerStatusSafely({
          id: officer.id,
          status: officer.status,
          flag: officer.flag,
          nextStatus,
          nextFlag,
        })
      } catch (error) {
        // Ein anderer Prozess kann genau diesen Officer gerade aktualisieren.
        // Der nächste Lauf liest den neuen Stand erneut; die Abmeldung selbst
        // bleibt trotzdem erfolgreich gespeichert.
        if (isRecordChangedError(error)) {
          console.warn(`[AbsenceStatus] Konkurrierendes Officer-Update übersprungen (${officer.id})`)
          continue
        }
        throw error
      }
      if (result.count > 0) updated++
    }
  }

  return { skipped: false, updated, notesCreated }
}
