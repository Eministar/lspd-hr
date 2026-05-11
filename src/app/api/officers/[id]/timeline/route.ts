import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { sessionDurationMs } from '@/lib/duty-times'

type TimelineItem = {
  id: string
  type: string
  title: string
  description?: string | null
  createdAt: Date
  meta?: Record<string, unknown>
}

function push(items: TimelineItem[], item: TimelineItem) {
  items.push(item)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('officers:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }

  const { id } = await params
  const officer = await prisma.officer.findUnique({
    where: { id },
    include: {
      rank: true,
      promotionLogs: {
        include: { oldRank: true, newRank: true, performedBy: { select: { displayName: true } } },
      },
      sanctions: { include: { issuedBy: { select: { displayName: true } } } },
      officerNotes: { include: { author: { select: { displayName: true } } } },
      terminations: { include: { terminatedBy: { select: { displayName: true } } } },
      trainings: { include: { training: true } },
      absenceNotices: true,
      dutySessions: true,
      playtimeSessions: true,
      probation: { include: { createdBy: { select: { displayName: true } }, decidedBy: { select: { displayName: true } } } },
      calendarEvents: true,
      auditLogs: { include: { user: { select: { displayName: true } } } },
    },
  })
  if (!officer) return notFound('Officer')

  const items: TimelineItem[] = []
  push(items, {
    id: `hire-${officer.id}`,
    type: 'hire',
    title: 'Einstellung',
    description: `${officer.firstName} ${officer.lastName} als ${officer.rank.name}`,
    createdAt: officer.hireDate,
  })

  for (const log of officer.promotionLogs) {
    push(items, {
      id: `rank-${log.id}`,
      type: log.newRank.sortOrder < log.oldRank.sortOrder ? 'promotion' : 'demotion',
      title: log.newRank.sortOrder < log.oldRank.sortOrder ? 'Beförderung' : 'Degradierung',
      description: `${log.oldRank.name} → ${log.newRank.name}${log.note ? ` · ${log.note}` : ''}`,
      createdAt: log.createdAt,
      meta: { actor: log.performedBy?.displayName ?? 'Gelöscht', oldBadgeNumber: log.oldBadgeNumber, newBadgeNumber: log.newBadgeNumber },
    })
  }

  for (const sanction of officer.sanctions) {
    push(items, {
      id: `sanction-${sanction.id}`,
      type: 'sanction',
      title: `Sanktion ${sanction.penalGrade}`,
      description: sanction.reason,
      createdAt: sanction.createdAt,
      meta: { status: sanction.status, fineAmount: sanction.fineAmount, actor: sanction.issuedBy?.displayName ?? 'Gelöscht' },
    })
  }

  for (const note of officer.officerNotes) {
    push(items, {
      id: `note-${note.id}`,
      type: 'note',
      title: note.title || 'Notiz',
      description: note.content,
      createdAt: note.createdAt,
      meta: { author: note.author?.displayName ?? 'Gelöscht', pinned: note.pinned },
    })
  }

  for (const termination of officer.terminations) {
    push(items, {
      id: `termination-${termination.id}`,
      type: 'termination',
      title: 'Kündigung',
      description: termination.reason,
      createdAt: termination.terminatedAt,
      meta: { actor: termination.terminatedBy?.displayName ?? 'Gelöscht' },
    })
  }

  for (const training of officer.trainings) {
    push(items, {
      id: `training-${training.id}`,
      type: 'training',
      title: training.completed ? 'Ausbildung abgeschlossen' : 'Ausbildung offen',
      description: training.training.label,
      createdAt: training.updatedAt,
      meta: { completed: training.completed },
    })
  }

  for (const absence of officer.absenceNotices) {
    push(items, {
      id: `absence-${absence.id}`,
      type: 'absence',
      title: 'Abmeldung',
      description: absence.reason,
      createdAt: absence.startsAt,
      meta: { endsAt: absence.endsAt, source: absence.source },
    })
  }

  for (const duty of officer.dutySessions) {
    push(items, {
      id: `duty-${duty.id}`,
      type: 'duty',
      title: duty.clockOutAt ? 'Dienstzeit beendet' : 'Dienstzeit gestartet',
      description: duty.clockOutAt ? undefined : 'Aktive Dienstzeit',
      createdAt: duty.clockInAt,
      meta: { clockOutAt: duty.clockOutAt, durationMs: sessionDurationMs(duty) },
    })
  }

  for (const playtime of officer.playtimeSessions) {
    push(items, {
      id: `playtime-${playtime.id}`,
      type: 'playtime',
      title: 'Spielzeit',
      description: playtime.playerName,
      createdAt: playtime.startedAt,
      meta: { endedAt: playtime.endedAt, durationMs: sessionDurationMs({ clockInAt: playtime.startedAt, clockOutAt: playtime.endedAt }) },
    })
  }

  if (officer.probation) {
    push(items, {
      id: `probation-${officer.probation.id}`,
      type: 'probation',
      title: `Probezeit: ${officer.probation.status}`,
      description: officer.probation.resultNote,
      createdAt: officer.probation.startsAt,
      meta: { endsAt: officer.probation.endsAt, decidedBy: officer.probation.decidedBy?.displayName ?? null },
    })
  }

  for (const event of officer.calendarEvents) {
    push(items, {
      id: `event-${event.id}`,
      type: 'calendar',
      title: event.title,
      description: event.description,
      createdAt: event.startsAt,
      meta: { eventType: event.type, location: event.location, endsAt: event.endsAt },
    })
  }

  for (const audit of officer.auditLogs) {
    push(items, {
      id: `audit-${audit.id}`,
      type: 'audit',
      title: audit.action,
      description: audit.details,
      createdAt: audit.createdAt,
      meta: { actor: audit.user?.displayName ?? 'Gelöscht', oldValue: audit.oldValue, newValue: audit.newValue },
    })
  }

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return success({ officer: { id: officer.id, firstName: officer.firstName, lastName: officer.lastName, badgeNumber: officer.badgeNumber }, items })
}
