import { prisma } from './prisma'

export const END_REASONS = ['leave', 'disband', 'crew', 'disconnect', 'server_shutdown'] as const
const DISCORD_SNOWFLAKE = /^\d{17,22}$/

export type SessionInput = {
  externalId?: string | null
  officerDiscordId?: string | null
  officerName?: string
  scope?: string
  patrolName?: string
  designationAtJoin?: string | null
  gradeAtJoin?: number | null
  joinedAt?: string
  leftAt?: string | null
  durationSeconds?: number
  endReason?: string
}

export async function resolveOfficerIdByDiscord(discordId: string | null | undefined): Promise<string | null> {
  const id = discordId?.trim()
  if (!id || !DISCORD_SNOWFLAKE.test(id)) return null
  const officer = await prisma.officer.findUnique({ where: { discordId: id }, select: { id: true } })
  return officer?.id ?? null
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function ingestSession(
  input: SessionInput,
): Promise<{ status: 'created' | 'updated' | 'invalid'; error?: string; id?: string }> {
  const officerName = typeof input.officerName === 'string' ? input.officerName.trim() : ''
  const scope = typeof input.scope === 'string' ? input.scope.trim() : ''
  const patrolName = typeof input.patrolName === 'string' ? input.patrolName.trim() : ''
  const endReason = typeof input.endReason === 'string' ? input.endReason.trim() : ''
  const joinedAt = parseDate(input.joinedAt)
  const leftAt = input.leftAt == null ? null : parseDate(input.leftAt)
  const duration = typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds)
    ? Math.trunc(input.durationSeconds)
    : NaN

  if (!officerName) return { status: 'invalid', error: 'officerName fehlt' }
  if (!scope) return { status: 'invalid', error: 'scope fehlt' }
  if (!patrolName) return { status: 'invalid', error: 'patrolName fehlt' }
  if (!joinedAt) return { status: 'invalid', error: 'joinedAt ungültig' }
  if (!Number.isFinite(duration) || duration < 0) return { status: 'invalid', error: 'durationSeconds ungültig' }
  if (!(END_REASONS as readonly string[]).includes(endReason)) {
    return { status: 'invalid', error: `endReason muss eins von ${END_REASONS.join(', ')} sein` }
  }

  const officerId = await resolveOfficerIdByDiscord(input.officerDiscordId)
  const gradeAtJoin = typeof input.gradeAtJoin === 'number' && Number.isFinite(input.gradeAtJoin)
    ? Math.trunc(input.gradeAtJoin)
    : null
  const externalId = typeof input.externalId === 'string' && input.externalId.trim() ? input.externalId.trim() : null

  const data = {
    officerId,
    officerDiscordId: input.officerDiscordId?.trim() || null,
    officerName,
    scope,
    patrolName,
    designationAtJoin: typeof input.designationAtJoin === 'string' && input.designationAtJoin.trim()
      ? input.designationAtJoin.trim()
      : null,
    gradeAtJoin,
    joinedAt,
    leftAt,
    durationSeconds: duration,
    endReason,
  }

  if (externalId) {
    const existing = await prisma.patrolSession.findUnique({ where: { externalId }, select: { id: true } })
    const row = await prisma.patrolSession.upsert({
      where: { externalId },
      create: { externalId, ...data },
      update: data,
      select: { id: true },
    })
    return { status: existing ? 'updated' : 'created', id: row.id }
  }

  const row = await prisma.patrolSession.create({ data, select: { id: true } })
  return { status: 'created', id: row.id }
}
