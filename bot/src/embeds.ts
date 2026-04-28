import { EmbedBuilder, hexColorToInt } from './util/color.js'
import type { BackendOfficer } from './backend.js'
import { config } from './config.js'

const STATUS_EMOJI: Record<string, string> = {
  ACTIVE: '🟢',
  AWAY: '🟡',
  INACTIVE: '⚪',
  TERMINATED: '🔴',
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktiv',
  AWAY: 'Abgemeldet',
  INACTIVE: 'Inaktiv',
  TERMINATED: 'Gekündigt',
}

const FLAG_EMOJI: Record<string, string> = {
  RED: '🔴',
  ORANGE: '🟠',
  YELLOW: '🟡',
}

const UNIT_LABEL: Record<string, string> = {
  HR_LEITUNG: 'HR Leitung',
  HR_TRAINEE: 'HR Trainee',
  HR_OFFICER: 'HR Officer',
  ACADEMY: 'Academy',
  SRU: 'SRU',
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function officerInfoEmbed(officer: BackendOfficer): EmbedBuilder {
  const completed = officer.trainings.filter((t) => t.completed)
  const open = officer.trainings.filter((t) => !t.completed)

  const trainingLines = officer.trainings.length === 0
    ? '*Keine Ausbildungen hinterlegt.*'
    : [
        ...completed.map((t) => `✅ **${t.label}**${t.discordRoleId ? '  · 🪪 <@&' + t.discordRoleId + '>' : ''}`),
        ...open.map((t) => `⬜ ${t.label}`),
      ].join('\n')

  const embed = new EmbedBuilder()
    .setTitle(`${officer.firstName} ${officer.lastName}`)
    .setColor(hexColorToInt(officer.rank.color) ?? config.brand.color)
    .setAuthor({ name: `${config.brand.name} · ${officer.badgeNumber}`, iconURL: config.brand.iconUrl || undefined })
    .addFields(
      {
        name: '📛 Rang',
        value: `**${officer.rank.name}**${officer.rank.discordRoleId ? `\n<@&${officer.rank.discordRoleId}>` : ''}`,
        inline: true,
      },
      {
        name: '🆔 Status',
        value: `${STATUS_EMOJI[officer.status] || '⚪'} ${STATUS_LABEL[officer.status] || officer.status}`,
        inline: true,
      },
      {
        name: '👤 Discord',
        value: officer.discordId ? `<@${officer.discordId}>` : '*nicht verknüpft*',
        inline: true,
      },
      {
        name: '🏢 Unit',
        value: officer.unit ? UNIT_LABEL[officer.unit] || officer.unit : '—',
        inline: true,
      },
      {
        name: '🚩 Markierung',
        value: officer.flag ? `${FLAG_EMOJI[officer.flag] || ''} ${officer.flag}` : '—',
        inline: true,
      },
      {
        name: '📅 Eingestellt',
        value: formatDate(officer.hireDate),
        inline: true,
      },
      {
        name: `🎓 Ausbildungen (${completed.length}/${officer.trainings.length})`,
        value: trainingLines.slice(0, 1024),
        inline: false,
      },
    )
    .setFooter({ text: `ID: ${officer.id}` })
    .setTimestamp()

  return embed
}

export function promotionEmbed(opts: {
  officer: BackendOfficer
  oldRankName: string
  newRankName: string
  isPromotion: boolean
  actor?: string
  note?: string
}): EmbedBuilder {
  const { officer, oldRankName, newRankName, isPromotion, actor, note } = opts
  const color = isPromotion ? config.brand.promotionColor : config.brand.demotionColor
  const arrow = isPromotion ? '⬆️' : '⬇️'
  const title = isPromotion ? 'Beförderung' : 'Degradierung'
  return new EmbedBuilder()
    .setTitle(`${arrow} ${title}`)
    .setColor(color)
    .setAuthor({ name: `${config.brand.name} · ${officer.badgeNumber}`, iconURL: config.brand.iconUrl || undefined })
    .setDescription(
      `**${officer.firstName} ${officer.lastName}** wurde ${isPromotion ? 'befördert' : 'degradiert'}.\n` +
        `> ~~${oldRankName}~~  →  **${newRankName}**`
    )
    .addFields(
      ...(officer.discordId ? [{ name: 'Officer', value: `<@${officer.discordId}>`, inline: true }] : []),
      ...(actor ? [{ name: 'Durchgeführt von', value: actor, inline: true }] : []),
      ...(note ? [{ name: 'Notiz', value: `*${note}*`, inline: false }] : []),
    )
    .setFooter({ text: `Dienstnummer ${officer.badgeNumber}` })
    .setTimestamp()
}

export function trainingEmbed(opts: {
  officer: BackendOfficer
  changes: { label: string; completed: boolean }[]
  actor?: string
}): EmbedBuilder {
  const { officer, changes, actor } = opts
  const lines = changes
    .map((c) => `${c.completed ? '✅' : '↩️'} ${c.label} ${c.completed ? '*abgeschlossen*' : '*zurückgesetzt*'}`)
    .join('\n')
  return new EmbedBuilder()
    .setTitle('🎓 Ausbildung aktualisiert')
    .setColor(config.brand.trainingColor)
    .setAuthor({ name: `${config.brand.name} · ${officer.badgeNumber}`, iconURL: config.brand.iconUrl || undefined })
    .setDescription(
      `**${officer.firstName} ${officer.lastName}**${officer.discordId ? ` (<@${officer.discordId}>)` : ''}\n${lines}`
    )
    .addFields(...(actor ? [{ name: 'Durchgeführt von', value: actor, inline: true }] : []))
    .setFooter({ text: `Dienstnummer ${officer.badgeNumber}` })
    .setTimestamp()
}

export function terminationEmbed(opts: {
  officer: BackendOfficer
  reason?: string
  actor?: string
}): EmbedBuilder {
  const { officer, reason, actor } = opts
  return new EmbedBuilder()
    .setTitle('🛑 Kündigung')
    .setColor(config.brand.terminationColor)
    .setAuthor({ name: `${config.brand.name} · ${officer.badgeNumber}`, iconURL: config.brand.iconUrl || undefined })
    .setDescription(
      `**${officer.firstName} ${officer.lastName}** wurde aus dem Dienst entlassen.${
        officer.discordId ? `\nDiscord: <@${officer.discordId}>` : ''
      }`
    )
    .addFields(
      ...(reason ? [{ name: 'Grund', value: reason, inline: false }] : []),
      ...(actor ? [{ name: 'Durchgeführt von', value: actor, inline: true }] : []),
    )
    .setFooter({ text: `Letzter Rang: ${officer.rank.name} · DN ${officer.badgeNumber}` })
    .setTimestamp()
}

export function hireEmbed(opts: { officer: BackendOfficer; actor?: string }): EmbedBuilder {
  const { officer, actor } = opts
  return new EmbedBuilder()
    .setTitle('🎉 Neuer Officer')
    .setColor(config.brand.color)
    .setAuthor({ name: `${config.brand.name} · ${officer.badgeNumber}`, iconURL: config.brand.iconUrl || undefined })
    .setDescription(
      `**${officer.firstName} ${officer.lastName}** wurde eingestellt.\n` +
        `Rang: **${officer.rank.name}**${officer.discordId ? `\nDiscord: <@${officer.discordId}>` : ''}`
    )
    .addFields(...(actor ? [{ name: 'Eingestellt von', value: actor, inline: true }] : []))
    .setFooter({ text: `Dienstnummer ${officer.badgeNumber}` })
    .setTimestamp()
}

export function helpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`📘 ${config.brand.name} · Bot-Hilfe`)
    .setColor(config.brand.color)
    .setDescription(
      [
        'Dieser Bot ist die Discord-Schnittstelle für das HR-System.',
        '',
        '**Slash-Commands:**',
        '`/officer info` — Officer-Profil als Embed',
        '`/officer search` — Officer suchen',
        '`/officer sync` — Discord-Rollen für einen Officer neu setzen',
        '`/training list` — Alle Ausbildungen + Mapping',
        '`/training set` — Ausbildung markieren *(HR)*',
        '`/rank list` — Alle Ränge + Mapping',
        '`/sync-all` — Alle Officer-Rollen neu setzen *(Admin)*',
        '`/help` — diese Hilfe',
        '',
        '**Buttons** im Officer-Embed:',
        '🔄 Rollen syncen · 🎓 Ausbildung setzen · 🔗 Im Web öffnen',
      ].join('\n')
    )
    .setTimestamp()
}
