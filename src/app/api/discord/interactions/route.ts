import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { findBadgeNumberConflict, getBlacklistedBadgeRows } from '@/lib/badge-blacklist'
import { nextBadgeForRank, rankHasBadgeRange } from '@/lib/badge-number'
import { normalizeUnitKeys } from '@/lib/officer-units'
import {
  getDiscordConfig,
  queueDiscordDutyEvent,
  queueDiscordDutyStatusUpdate,
  queueDiscordHrEvent,
  queueOfficerRoleSync,
} from '@/lib/discord-integration'
import { clockInOfficer, clockOutOfficer, formatDuration } from '@/lib/duty-times'
import { createAbsenceNotice, formatAbsenceDate, parseAbsenceDate } from '@/lib/absence-status'
import { isUniqueConstraintError } from '@/lib/prisma-errors'

export const runtime = 'nodejs'

type DiscordOption = {
  name: string
  type: number
  value?: string | boolean
  focused?: boolean
}

type DiscordInteraction = {
  type: number
  data?: {
    name?: string
    custom_id?: string
    options?: DiscordOption[]
  }
  member?: {
    roles?: string[]
    permissions?: string
    user?: {
      id: string
      username?: string
      global_name?: string | null
    }
  }
}

const PUBLIC_KEY_PREFIX = '302a300506032b6570032100'
const EPHEMERAL = 64
const APPLICATION_COMMAND = 2
const MESSAGE_COMPONENT = 3
const AUTOCOMPLETE = 4
const ADMINISTRATOR = BigInt(8)

function json(data: unknown) {
  return NextResponse.json(data)
}

function reply(content: string) {
  return json({ type: 4, data: { content, flags: EPHEMERAL } })
}

function autocomplete(choices: { name: string; value: string }[]) {
  return json({ type: 8, data: { choices: choices.slice(0, 25) } })
}

function option(options: DiscordOption[] | undefined, name: string) {
  return options?.find((item) => item.name === name)?.value
}

function textOption(options: DiscordOption[] | undefined, name: string) {
  const value = option(options, name)
  return typeof value === 'string' ? value.trim() : ''
}

function boolOption(options: DiscordOption[] | undefined, name: string) {
  return option(options, name) === true
}

function userOption(options: DiscordOption[] | undefined, name: string) {
  return textOption(options, name)
}

function actorFromInteraction(interaction: DiscordInteraction) {
  const user = interaction.member?.user
  return {
    displayName: user?.global_name || user?.username || 'Discord Command',
    discordId: user?.id ?? null,
  }
}

function hasAdminPermission(permissions: string | undefined) {
  try {
    return permissions !== undefined && (BigInt(permissions) & ADMINISTRATOR) === ADMINISTRATOR
  } catch {
    return false
  }
}

async function verifySignature(req: NextRequest, rawBody: string) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim() || process.env.LSPD_DISCORD_PUBLIC_KEY?.trim() || ''
  if (!publicKey) return false

  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  if (!signature || !timestamp) return false

  const key = crypto.createPublicKey({
    key: Buffer.from(`${PUBLIC_KEY_PREFIX}${publicKey}`, 'hex'),
    format: 'der',
    type: 'spki',
  })

  return crypto.verify(null, Buffer.from(`${timestamp}${rawBody}`), key, Buffer.from(signature, 'hex'))
}

async function ensureAllowed(interaction: DiscordInteraction) {
  const config = await getDiscordConfig()
  if (hasAdminPermission(interaction.member?.permissions)) return true

  const memberRoles = interaction.member?.roles ?? []
  return config.commandRoleIds.length > 0 && config.commandRoleIds.some((roleId) => memberRoles.includes(roleId))
}

async function isLinkedOfficer(discordId: string | null | undefined) {
  if (!discordId) return false
  const officer = await prisma.officer.findFirst({
    where: { discordId, status: { not: 'TERMINATED' } },
    select: { id: true },
  })
  return !!officer
}

async function findRank(value: string) {
  return prisma.rank.findFirst({
    where: {
      OR: [
        { id: value },
        { name: { equals: value } },
      ],
    },
  })
}

async function findTraining(value: string) {
  return prisma.training.findFirst({
    where: {
      OR: [
        { id: value },
        { key: { equals: value } },
        { label: { equals: value } },
      ],
    },
  })
}

async function findUnit(value: string) {
  return prisma.unit.findFirst({
    where: {
      OR: [
        { key: { equals: value } },
        { name: { equals: value } },
      ],
    },
  })
}

async function unitKeysFromText(value: string) {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean)
  const units = await Promise.all(parts.map(findUnit))
  return normalizeUnitKeys(units.filter(Boolean).map((unit) => unit!.key))
}

async function systemUserId() {
  const user = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } })
  if (!user) throw new Error('Es existiert kein Dashboard-Benutzer für Log-Einträge.')
  return user.id
}

async function autocompleteFor(kind: 'rang' | 'ausbildung' | 'unit', query: string) {
  const contains = query.trim()
  if (kind === 'rang') {
    const rows = await prisma.rank.findMany({
      where: contains ? { name: { contains } } : undefined,
      orderBy: { sortOrder: 'asc' },
      take: 25,
    })
    return autocomplete(rows.map((rank) => ({ name: rank.name, value: rank.id })))
  }
  if (kind === 'ausbildung') {
    const rows = await prisma.training.findMany({
      where: contains ? { label: { contains } } : undefined,
      orderBy: { sortOrder: 'asc' },
      take: 25,
    })
    return autocomplete(rows.map((training) => ({ name: training.label, value: training.id })))
  }

  const rows = await prisma.unit.findMany({
    where: {
      active: true,
      ...(contains ? { name: { contains } } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: 25,
  })
  return autocomplete(rows.map((unit) => ({ name: unit.name, value: unit.key })))
}

async function handleHire(options: DiscordOption[] | undefined, actor: ReturnType<typeof actorFromInteraction>) {
  const discordId = userOption(options, 'discord')
  const firstName = textOption(options, 'vorname')
  const lastName = textOption(options, 'nachname')
  const rank = await findRank(textOption(options, 'rang'))
  if (!discordId || !firstName || !lastName || !rank) return reply('Discord-User, Vorname, Nachname und Rang sind erforderlich.')

  const existingDiscord = await prisma.officer.findFirst({ where: { discordId } })
  if (existingDiscord) return reply('Dieser Discord-User ist bereits einem Officer zugeordnet.')

  const prefix = await getBadgePrefix()
  let badgeNumber = textOption(options, 'dienstnummer')
  if (!badgeNumber) {
    const [allRows, blacklistedBadges] = await Promise.all([
      prisma.officer.findMany({ where: { status: { not: 'TERMINATED' } }, select: { badgeNumber: true } }),
      getBlacklistedBadgeRows(),
    ])
    const assigned = nextBadgeForRank(rank, allRows, prefix, null, blacklistedBadges)
    if (!assigned) return reply('Keine freie Dienstnummer im Bereich des ausgewählten Rangs.')
    badgeNumber = assigned.str
  }

  const conflict = await findBadgeNumberConflict(badgeNumber, prefix)
  if (conflict) return reply(conflict)

  const unitKeys = await unitKeysFromText(textOption(options, 'units'))
  const officer = await prisma.officer.create({
    data: {
      discordId,
      firstName,
      lastName,
      rankId: rank.id,
      badgeNumber,
      status: 'ACTIVE',
      unit: unitKeys[0] ?? null,
      units: unitKeys,
      hireDate: new Date(),
    },
    include: { rank: true },
  })

  const trainings = await prisma.training.findMany()
  if (trainings.length > 0) {
    await prisma.officerTraining.createMany({
      data: trainings.map((training) => ({ officerId: officer.id, trainingId: training.id, completed: false })),
    })
  }

  queueOfficerRoleSync(officer.id)
  queueDiscordHrEvent({
    type: 'hire',
    title: 'Neuer Beitritt',
    officer,
    actor,
  })

  return reply(`Einstellung erstellt: ${firstName} ${lastName} (${badgeNumber})`)
}

async function handlePromotion(options: DiscordOption[] | undefined, actor: ReturnType<typeof actorFromInteraction>) {
  const discordId = userOption(options, 'discord')
  const officer = await prisma.officer.findFirst({ where: { discordId }, include: { rank: true } })
  const newRank = await findRank(textOption(options, 'rang'))
  if (!officer || !newRank) return reply('Officer oder neuer Rang wurde nicht gefunden.')

  const prefix = await getBadgePrefix()
  let newBadgeNumber = textOption(options, 'dienstnummer')
  if (!newBadgeNumber) {
    if (rankHasBadgeRange(newRank)) {
      const [allRows, blacklistedBadges] = await Promise.all([
        prisma.officer.findMany({ where: { status: { not: 'TERMINATED' } }, select: { badgeNumber: true } }),
        getBlacklistedBadgeRows(),
      ])
      const assigned = nextBadgeForRank(newRank, allRows, prefix, officer.badgeNumber, blacklistedBadges)
      if (!assigned) return reply('Keine freie Dienstnummer im Bereich des Ziel-Rangs.')
      newBadgeNumber = assigned.str
    } else {
      newBadgeNumber = officer.badgeNumber
    }
  }

  if (newBadgeNumber !== officer.badgeNumber) {
    const conflict = await findBadgeNumberConflict(newBadgeNumber, prefix, officer.id)
    if (conflict) return reply(conflict)
  }

  const promotion = await prisma.promotionLog.create({
    data: {
      officerId: officer.id,
      oldRankId: officer.rankId,
      newRankId: newRank.id,
      oldBadgeNumber: officer.badgeNumber,
      newBadgeNumber,
      performedByUserId: await systemUserId(),
      note: textOption(options, 'notiz') || 'Discord-Command',
    },
  })

  const updated = await prisma.officer.update({
    where: { id: officer.id },
    data: { rankId: newRank.id, badgeNumber: newBadgeNumber },
    include: { rank: true },
  })

  queueOfficerRoleSync(officer.id)
  queueDiscordHrEvent({
    type: 'promotion',
    title: `${newRank.sortOrder < officer.rank.sortOrder ? 'Beförderung' : 'Rangänderung'}: ${officer.firstName} ${officer.lastName}`,
    description: textOption(options, 'notiz') ? `📝 ${textOption(options, 'notiz')}` : 'Rangänderung erfolgreich durchgeführt.',
    officer: updated,
    actor,
    fields: [
      { name: '⬅️ Alter Rang', value: officer.rank.name, inline: true },
      { name: '➡️ Neuer Rang', value: newRank.name, inline: true },
      { name: '🔁 Dienstnummer-Wechsel', value: `${officer.badgeNumber} → ${newBadgeNumber}`, inline: true },
      { name: '📅 Gültig ab', value: promotion.createdAt.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }), inline: true },
    ],
  })

  return reply(`Rang geändert: ${officer.firstName} ${officer.lastName} von ${officer.rank.name} auf ${newRank.name}.`)
}

async function handleTraining(options: DiscordOption[] | undefined, actor: ReturnType<typeof actorFromInteraction>) {
  const discordId = userOption(options, 'discord')
  const officer = await prisma.officer.findFirst({ where: { discordId }, include: { rank: true } })
  const training = await findTraining(textOption(options, 'ausbildung'))
  if (!officer || !training) return reply('Officer oder Ausbildung wurde nicht gefunden.')

  const completed = boolOption(options, 'abgeschlossen')
  await prisma.officerTraining.upsert({
    where: { officerId_trainingId: { officerId: officer.id, trainingId: training.id } },
    create: { officerId: officer.id, trainingId: training.id, completed },
    update: { completed },
  })

  queueOfficerRoleSync(officer.id)
  queueDiscordHrEvent({
    type: 'training',
    title: `Ausbildung aktualisiert: ${officer.firstName} ${officer.lastName}`,
    description: 'Ausbildungsstand aktualisiert.',
    officer,
    actor,
    fields: [{ name: `🎓 ${training.label}`, value: completed ? '✅ abgeschlossen' : '⏳ offen', inline: true }],
  })

  return reply(`${training.label} wurde für ${officer.firstName} ${officer.lastName} auf ${completed ? 'abgeschlossen' : 'offen'} gesetzt.`)
}

async function handleUnit(options: DiscordOption[] | undefined, actor: ReturnType<typeof actorFromInteraction>) {
  const discordId = userOption(options, 'discord')
  const action = textOption(options, 'aktion')
  const unit = await findUnit(textOption(options, 'unit'))
  const officer = await prisma.officer.findFirst({ where: { discordId }, include: { rank: true } })
  if (!officer || !unit) return reply('Officer oder Unit wurde nicht gefunden.')

  const current = normalizeUnitKeys(officer.units ?? (officer.unit ? [officer.unit] : []))
  const next = action === 'set'
    ? [unit.key]
    : action === 'remove'
      ? current.filter((key) => key !== unit.key)
      : Array.from(new Set([...current, unit.key]))

  const updated = await prisma.officer.update({
    where: { id: officer.id },
    data: { unit: next[0] ?? null, units: next },
    include: { rank: true },
  })

  queueOfficerRoleSync(officer.id)
  queueDiscordHrEvent({
    type: 'units',
    title: `Unit geändert: ${officer.firstName} ${officer.lastName}`,
    description: 'Unit-Zuordnung aktualisiert.',
    officer: updated,
    actor,
    fields: [{ name: '🚓 Units', value: `${current.join(', ') || '-'} → ${next.join(', ') || '-'}` }],
  })

  return reply(`Units aktualisiert: ${updated.firstName} ${updated.lastName} → ${next.join(', ') || 'keine Unit'}.`)
}

async function handleTermination(options: DiscordOption[] | undefined, actor: ReturnType<typeof actorFromInteraction>) {
  const discordId = userOption(options, 'discord')
  const reason = textOption(options, 'grund')
  const officer = await prisma.officer.findFirst({ where: { discordId }, include: { rank: true } })
  if (!officer) return reply('Officer wurde nicht gefunden.')
  if (officer.status === 'TERMINATED') return reply('Officer ist bereits gekündigt.')
  if (!reason) return reply('Ein Grund ist erforderlich.')

  await prisma.termination.create({
    data: {
      officerId: officer.id,
      reason,
      terminatedByUserId: await systemUserId(),
      previousRank: officer.rank.name,
      previousBadgeNumber: officer.badgeNumber,
      previousFirstName: officer.firstName,
      previousLastName: officer.lastName,
    },
  })
  await prisma.officer.update({ where: { id: officer.id }, data: { status: 'TERMINATED' } })

  queueOfficerRoleSync(officer.id, 'remove-all')
  queueDiscordHrEvent({
    type: 'termination',
    title: `Kündigung: ${officer.firstName} ${officer.lastName}`,
    description: 'Dienstverhältnis beendet. Zugeordnete LSPD-Rollen wurden entfernt.',
    officer,
    actor,
    fields: [{ name: '📌 Grund', value: reason }],
  })

  return reply(`Kündigung eingetragen: ${officer.firstName} ${officer.lastName}.`)
}

async function handleAbsence(
  options: DiscordOption[] | undefined,
  actor: ReturnType<typeof actorFromInteraction>,
  interaction: DiscordInteraction,
) {
  const actorDiscordId = actor.discordId
  const targetDiscordId = userOption(options, 'discord') || actorDiscordId || ''
  if (!targetDiscordId) return reply('Discord-User konnte nicht erkannt werden.')

  if (targetDiscordId !== actorDiscordId && !(await ensureAllowed(interaction))) {
    return reply('Du darfst keine Abmeldungen für andere Officers erstellen.')
  }

  const officer = await prisma.officer.findFirst({
    where: { discordId: targetDiscordId },
    include: { rank: true },
  })
  if (!officer) return reply('Officer wurde nicht gefunden. Prüfe die Discord-Verknüpfung im HR-Tool.')

  const startsAt = parseAbsenceDate(textOption(options, 'von')) ?? new Date()
  const endsAt = parseAbsenceDate(textOption(options, 'bis'), { hours: 23, minutes: 59 })
  const reason = textOption(options, 'grund')
  if (!endsAt) return reply('Enddatum ist ungültig. Nutze z.B. 12.05.2026 20:00.')
  if (!reason) return reply('Ein Grund ist erforderlich.')

  const result = await createAbsenceNotice({
    officerId: officer.id,
    startsAt,
    endsAt,
    reason,
    source: 'discord',
    actorDiscordId,
  })

  queueOfficerRoleSync(officer.id)
  queueDiscordHrEvent({
    type: 'update',
    title: `Abmeldung: ${officer.firstName} ${officer.lastName}`,
    description: 'Officer wurde über Discord abgemeldet und blau markiert.',
    officer: result.officer,
    actor,
    fields: [
      { name: 'Von', value: formatAbsenceDate(startsAt), inline: true },
      { name: 'Bis', value: formatAbsenceDate(endsAt), inline: true },
      { name: 'Grund', value: reason },
    ],
  })

  return reply(`Abmeldung eingetragen: ${officer.firstName} ${officer.lastName} · ${formatAbsenceDate(startsAt)} bis ${formatAbsenceDate(endsAt)}.`)
}

async function handleDutyButton(interaction: DiscordInteraction) {
  const customId = interaction.data?.custom_id
  const discordId = interaction.member?.user?.id
  if (!discordId) return reply('Discord-User konnte nicht erkannt werden.')

  if (customId === 'lspd_duty_refresh') {
    queueDiscordDutyStatusUpdate()
    return reply('Dienstzeiten-Embed wird aktualisiert.')
  }

  const officer = await prisma.officer.findFirst({
    where: { discordId },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!officer) return reply('Dein Discord-Account ist keinem Officer im HR-Tool zugeordnet.')

  if (customId === 'lspd_duty_clock_in') {
    const result = await clockInOfficer(officer.id, 'discord', discordId)
    queueDiscordDutyEvent('clock-in', result.officer, result.session)
    queueDiscordDutyStatusUpdate()
    return reply(`Eingestempelt: ${result.officer.firstName} ${result.officer.lastName}.`)
  }

  if (customId === 'lspd_duty_clock_out') {
    const result = await clockOutOfficer(officer.id, 'discord', discordId)
    queueDiscordDutyEvent('clock-out', result.officer, result.session, result.durationMs)
    queueDiscordDutyStatusUpdate()
    return reply(`Ausgestempelt: ${result.officer.firstName} ${result.officer.lastName} · Dauer ${formatDuration(result.durationMs)}.`)
  }

  return reply('Unbekannter Dienstzeiten-Button.')
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  if (!(await verifySignature(req, rawBody))) {
    return new NextResponse('Invalid request signature', { status: 401 })
  }

  const interaction = JSON.parse(rawBody) as DiscordInteraction
  if (interaction.type === 1) return json({ type: 1 })

  if (interaction.type === AUTOCOMPLETE) {
    const focused = interaction.data?.options?.find((item) => item.focused)
    if (focused?.name === 'rang') return autocompleteFor('rang', typeof focused.value === 'string' ? focused.value : '')
    if (focused?.name === 'ausbildung') return autocompleteFor('ausbildung', typeof focused.value === 'string' ? focused.value : '')
    if (focused?.name === 'unit') return autocompleteFor('unit', typeof focused.value === 'string' ? focused.value : '')
    return autocomplete([])
  }

  if (interaction.type === MESSAGE_COMPONENT) {
    try {
      return await handleDutyButton(interaction)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Serverfehler'
      return reply(message)
    }
  }

  if (interaction.type !== APPLICATION_COMMAND) return reply('Diese Discord-Interaktion wird nicht unterstützt.')
  const commandName = interaction.data?.name
  const actor = actorFromInteraction(interaction)
  const allowed = await ensureAllowed(interaction)
  if (!allowed && !(commandName === 'lspd-abmeldung' && await isLinkedOfficer(actor.discordId))) {
    return reply('Du darfst diese HR-Commands nicht ausführen.')
  }

  try {
    const options = interaction.data?.options
    switch (commandName) {
      case 'lspd-einstellung':
        return await handleHire(options, actor)
      case 'lspd-beförderung':
        return await handlePromotion(options, actor)
      case 'lspd-ausbildung':
        return await handleTraining(options, actor)
      case 'lspd-unit':
        return await handleUnit(options, actor)
      case 'lspd-kündigung':
        return await handleTermination(options, actor)
      case 'lspd-abmeldung':
        return await handleAbsence(options, actor, interaction)
      default:
        return reply('Unbekannter Command.')
    }
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return reply('Dienstnummer oder Discord-ID ist bereits vergeben.')
    const message = e instanceof Error ? e.message : 'Serverfehler'
    console.error('[DiscordInteractions] Command fehlgeschlagen:', e)
    return reply(message)
  }
}
