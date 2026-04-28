import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import type { BackendOfficer } from './backend.js'
import { config } from './config.js'

export function officerActionRow(officer: BackendOfficer): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`officer:sync:${officer.id}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel('Rollen syncen')
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId(`officer:trainings:${officer.id}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Ausbildungen')
      .setEmoji('🎓'),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Im Web öffnen')
      .setURL(`${config.backendUrl}/officers/${officer.id}`)
      .setEmoji('🔗'),
  )

  return [row1]
}

export function trainingTogglesForOfficer(officer: BackendOfficer): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  let current = new ActionRowBuilder<ButtonBuilder>()
  for (const t of officer.trainings.slice(0, 25)) {
    if (current.components.length === 5) {
      rows.push(current)
      current = new ActionRowBuilder<ButtonBuilder>()
    }
    current.addComponents(
      new ButtonBuilder()
        .setCustomId(`training:toggle:${officer.id}:${t.key}:${t.completed ? '0' : '1'}`)
        .setStyle(t.completed ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setLabel(t.label.length > 75 ? t.label.slice(0, 72) + '…' : t.label)
        .setEmoji(t.completed ? '✅' : '⬜'),
    )
  }
  if (current.components.length > 0) rows.push(current)
  return rows
}
