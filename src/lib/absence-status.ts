import { prisma } from '@/lib/prisma'

const INACTIVITY_DAYS = 5
const AUTOMATION_INTERVAL_MS = 60_000

let lastAutomationRun = 0

export function parseAbsenceDate(value: string, fallbackTime?: { hours: number; minutes: number }) {
  const input = value.trim()
  if (!input) return null

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

  const absence = await prisma.absenceNotice.create({
    data: {
      officerId: input.officerId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: input.reason,
      source: input.source,
      actorDiscordId: input.actorDiscordId ?? null,
    },
  })

  await runOfficerStatusAutomation({ force: true })
  return { officer, absence }
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

export async function runOfficerStatusAutomation(options?: { force?: boolean }) {
  const now = new Date()
  if (!options?.force && now.getTime() - lastAutomationRun < AUTOMATION_INTERVAL_MS) {
    return { skipped: true }
  }
  lastAutomationRun = now.getTime()

  const inactiveCutoff = new Date(now.getTime() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000)
  const officers = await prisma.officer.findMany({
    where: { status: { not: 'TERMINATED' } },
    select: {
      id: true,
      status: true,
      flag: true,
      lastOnline: true,
      createdAt: true,
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
  for (const officer of officers) {
    const hasActiveAbsence = officer.absenceNotices.length > 0
    const lastSeen = officer.lastOnline ?? officer.createdAt
    const isInactive = lastSeen < inactiveCutoff
    const nextStatus = hasActiveAbsence ? 'AWAY' : isInactive ? 'INACTIVE' : 'ACTIVE'
    const nextFlag = hasActiveAbsence ? 'BLUE' : officer.flag === 'BLUE' ? null : officer.flag

    if (officer.status !== nextStatus || officer.flag !== nextFlag) {
      await prisma.officer.update({
        where: { id: officer.id },
        data: {
          status: nextStatus,
          flag: nextFlag,
        },
      })
      updated++
    }
  }

  return { skipped: false, updated }
}
