import { createAuditLog } from './audit'
import { editDiscordHrEventMessage, sendDiscordHrEvent, type DiscordField } from './discord-integration'
import { prisma } from './prisma'

export const PENAL_GRADES = new Set(['I', 'II', 'III', 'IV', 'V', 'MANUELL'])
export const SANCTION_STATUSES = new Set(['OPEN', 'PAID', 'ESCALATED'])

export const sanctionInclude = {
  officer: { include: { rank: true } },
  issuedBy: { select: { displayName: true, discordId: true } },
} as const

export async function getSanctionById(id: string) {
  return prisma.sanction.findUnique({
    where: { id },
    include: sanctionInclude,
  })
}

export type SanctionWithRelations = NonNullable<Awaited<ReturnType<typeof getSanctionById>>>

export function cleanSanctionText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseFineAmount(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const raw = typeof value === 'number'
    ? String(value)
    : String(value).replace(/[^\d]/g, '')
  if (!raw) return null

  const amount = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(amount) || amount < 0) return undefined
  if (amount > 1_000_000) return undefined
  return amount
}

export function parseDeadlineDays(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const days = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) return undefined
  return days
}

export function dueAtFromDeadlineDays(days: number | null) {
  if (days === null) return null
  const dueAt = new Date()
  dueAt.setDate(dueAt.getDate() + days)
  return dueAt
}

export function parseDueAt(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  const raw = value.trim()
  if (!raw) return null
  const date = new Date(raw.length <= 10 ? `${raw}T23:59:59` : raw)
  if (Number.isNaN(date.getTime())) return undefined
  return date
}

export function formatFineAmount(value: number | null) {
  if (value === null) return '—'
  return `${new Intl.NumberFormat('de-DE').format(value)} $`
}

export function penalGradeLabel(value: string) {
  return value === 'MANUELL' ? 'Manuell' : `Penal Grade ${value}`
}

export function sanctionStatusLabel(status: string) {
  switch (status) {
    case 'PAID':
      return 'Bezahlt'
    case 'ESCALATED':
      return 'Nicht bezahlt / verdoppelt'
    default:
      return 'Offen'
  }
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(value)
}

function officerSnapshot(sanction: SanctionWithRelations) {
  if (sanction.officer) return sanction.officer
  return {
    firstName: sanction.previousFirstName || 'Unbekannter',
    lastName: sanction.previousLastName || 'Officer',
    badgeNumber: sanction.previousBadgeNumber || '—',
    discordId: null,
    rankId: '',
    rank: { name: sanction.previousRank || '—', color: null },
  }
}

function sanctionOfficerName(sanction: SanctionWithRelations) {
  const officer = officerSnapshot(sanction)
  return `${officer.firstName} ${officer.lastName}`.trim()
}

function sanctionDiscordFields(sanction: SanctionWithRelations, note?: string): DiscordField[] {
  const fields: DiscordField[] = [
    { name: 'Penal Grade', value: penalGradeLabel(sanction.penalGrade), inline: true },
    { name: 'Geldstrafe', value: formatFineAmount(sanction.fineAmount), inline: true },
    { name: 'Status', value: sanctionStatusLabel(sanction.status), inline: true },
  ]

  if (sanction.dueAt) fields.push({ name: 'Frist', value: formatDateTime(sanction.dueAt), inline: true })
  if (sanction.paidAt) fields.push({ name: 'Bezahlt am', value: formatDateTime(sanction.paidAt), inline: true })
  if (sanction.escalatedAt) fields.push({ name: 'Verdoppelt am', value: formatDateTime(sanction.escalatedAt), inline: true })
  if (sanction.parentSanctionId) fields.push({ name: 'Folgesanktion', value: 'Automatisch aus nicht bezahlter Sanktion erstellt.', inline: false })
  if (sanction.penalty) fields.push({ name: 'Weitere Strafe', value: sanction.penalty, inline: false })
  fields.push({ name: 'Grund', value: sanction.reason, inline: false })
  if (note) fields.push({ name: 'Hinweis', value: note, inline: false })

  return fields
}

function statusDescription(sanction: SanctionWithRelations, override?: string) {
  if (override) return override
  if (sanction.status === 'PAID') return 'Sanktion wurde bezahlt.'
  if (sanction.status === 'ESCALATED') return 'Sanktion wurde nicht bezahlt. Es wurde eine weitere Sanktion erstellt.'
  if (sanction.dueAt) return `Zahlungsfrist bis ${formatDateTime(sanction.dueAt)}.`
  return undefined
}

export async function syncSanctionDiscordMessage(
  sanction: SanctionWithRelations,
  options?: { description?: string; note?: string; allowCreate?: boolean },
) {
  const event = {
    type: 'sanction' as const,
    title: `Sanktion: ${sanctionOfficerName(sanction)}`,
    description: statusDescription(sanction, options?.description),
    officer: officerSnapshot(sanction),
    actor: sanction.issuedBy,
    fields: sanctionDiscordFields(sanction, options?.note),
  }

  try {
    if (sanction.discordChannelId && sanction.discordMessageId) {
      await editDiscordHrEventMessage(sanction.discordChannelId, sanction.discordMessageId, event)
      return { channelId: sanction.discordChannelId, messageId: sanction.discordMessageId }
    }

    if (options?.allowCreate === false) return null
    const message = await sendDiscordHrEvent(event)
    if (message) {
      await prisma.sanction.update({
        where: { id: sanction.id },
        data: {
          discordChannelId: message.channelId,
          discordMessageId: message.messageId,
        },
      })
    }
    return message
  } catch (error) {
    console.error('[Sanctions] Discord-Embed konnte nicht synchronisiert werden:', error)
    return null
  }
}

export async function escalateSanction(
  sanctionId: string,
  options?: { actorUserId?: string; now?: Date; manual?: boolean },
) {
  const source = await getSanctionById(sanctionId)
  if (!source) throw new Error('Sanktion nicht gefunden')
  if (source.status !== 'OPEN') return null

  const now = options?.now ?? new Date()
  const doubledFine = source.fineAmount === null ? null : Math.min(source.fineAmount * 2, 2_147_483_647)
  const actorUserId = options?.actorUserId || source.issuedByUserId
  const originalFine = formatFineAmount(source.fineAmount)
  const newFine = formatFineAmount(doubledFine)
  const dueText = source.dueAt ? formatDateTime(source.dueAt) : 'ohne Frist'
  const officer = officerSnapshot(source)

  const created = await prisma.$transaction(async (tx) => {
    const claimed = await tx.sanction.updateMany({
      where: { id: sanctionId, status: 'OPEN' },
      data: {
        status: 'ESCALATED',
        escalatedAt: now,
        resolvedAt: now,
      },
    })
    if (claimed.count === 0) return null

    return tx.sanction.create({
      data: {
        officerId: source.officerId,
        reason: `Nicht bezahlt bis ${dueText}. Ursprünglicher Grund: ${source.reason}`,
        penalGrade: source.penalGrade,
        fineAmount: doubledFine,
        penalty: source.penalty
          ? `${source.penalty}\nAutomatische Verdopplung wegen nicht bezahlter Sanktion.`
          : 'Automatische Verdopplung wegen nicht bezahlter Sanktion.',
        issuedByUserId: actorUserId,
        parentSanctionId: source.id,
        previousRank: source.officer?.rank?.name ?? source.previousRank,
        previousBadgeNumber: officer.badgeNumber,
        previousFirstName: officer.firstName,
        previousLastName: officer.lastName,
      },
    })
  })

  if (!created) return null

  const [original, createdSanction] = await Promise.all([
    getSanctionById(source.id),
    getSanctionById(created.id),
  ])
  if (!original || !createdSanction) return null

  await Promise.all([
    syncSanctionDiscordMessage(original, {
      description: 'Sanktion wurde nicht bezahlt. Es wurde eine weitere Sanktion erstellt.',
      note: `Geldstrafe: ${originalFine} → ${newFine}`,
    }),
    syncSanctionDiscordMessage(createdSanction, {
      description: 'Automatische Folgesanktion wegen nicht bezahlter Sanktion.',
    }),
  ])

  await createAuditLog({
    action: options?.manual ? 'SANCTION_ESCALATED_MANUALLY' : 'SANCTION_AUTO_ESCALATED',
    userId: actorUserId,
    officerId: source.officerId ?? undefined,
    oldValue: originalFine,
    newValue: newFine,
    details: `${sanctionOfficerName(source)}: Sanktion nicht bezahlt, Geldstrafe verdoppelt (${originalFine} → ${newFine})`,
  })

  return { original, createdSanction }
}

export async function runSanctionDeadlineAutomation(options?: { now?: Date; limit?: number }) {
  const now = options?.now ?? new Date()
  const overdue = await prisma.sanction.findMany({
    where: {
      status: 'OPEN',
      dueAt: { not: null, lte: now },
    },
    orderBy: { dueAt: 'asc' },
    take: options?.limit ?? 50,
    select: { id: true },
  })

  let escalated = 0
  let skipped = 0
  let failed = 0

  for (const item of overdue) {
    try {
      const result = await escalateSanction(item.id, { now })
      if (result) escalated += 1
      else skipped += 1
    } catch (error) {
      failed += 1
      console.error('[Sanctions] Automatische Verdopplung fehlgeschlagen:', error)
    }
  }

  return {
    sanctionsChecked: overdue.length,
    sanctionsEscalated: escalated,
    sanctionsSkipped: skipped,
    sanctionsFailed: failed,
  }
}
