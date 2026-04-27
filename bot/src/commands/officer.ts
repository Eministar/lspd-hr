import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { backend } from '../backend.js'
import { officerInfoEmbed } from '../embeds.js'
import { officerActionRow } from '../components.js'
import { syncOfficer } from '../role-sync.js'
import type { BotCommand } from './index.js'

const data = new SlashCommandBuilder()
  .setName('officer')
  .setDescription('Officer-Profile aus dem HR-System')
  .addSubcommand((sub) =>
    sub
      .setName('info')
      .setDescription('Officer-Profil als Embed anzeigen')
      .addUserOption((o) => o.setName('user').setDescription('Discord-Nutzer (verknüpfter Officer)').setRequired(false))
      .addStringOption((o) => o.setName('badge').setDescription('Dienstnummer').setRequired(false))
      .addStringOption((o) => o.setName('id').setDescription('Officer-ID').setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('search')
      .setDescription('Officer suchen (Name, Dienstnummer, Discord-ID)')
      .addStringOption((o) => o.setName('query').setDescription('Suchbegriff').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('sync')
      .setDescription('Discord-Rollen für einen Officer neu setzen')
      .addUserOption((o) => o.setName('user').setDescription('Discord-Nutzer').setRequired(false))
      .addStringOption((o) => o.setName('id').setDescription('Officer-ID').setRequired(false)),
  )

async function findOfficerFromOptions(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser('user', false)
  const badge = interaction.options.getString('badge', false)
  const id = interaction.options.getString('id', false)
  if (id) return backend.getOfficer(id)
  if (user) return backend.getOfficerByDiscord(user.id)
  if (badge) {
    const list = await backend.searchOfficers(badge, 1)
    if (list.length === 0) throw new Error('Kein Officer mit dieser Dienstnummer gefunden.')
    return backend.getOfficer(list[0].id)
  }
  return backend.getOfficerByDiscord(interaction.user.id)
}

export const officerCommand: BotCommand = {
  data,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      if (sub === 'info') {
        const officer = await findOfficerFromOptions(interaction)
        await interaction.editReply({
          embeds: [officerInfoEmbed(officer)],
          components: officerActionRow(officer),
        })
        return
      }

      if (sub === 'search') {
        const q = interaction.options.getString('query', true)
        const list = await backend.searchOfficers(q, 10)
        if (list.length === 0) {
          await interaction.editReply({ content: `🔍 Keine Treffer für \`${q}\`.` })
          return
        }
        const lines = list
          .map(
            (o, i) =>
              `**${i + 1}.** \`${o.badgeNumber}\` · **${o.firstName} ${o.lastName}** · ${o.rank.name}` +
              (o.discordId ? ` · <@${o.discordId}>` : ''),
          )
          .join('\n')
        await interaction.editReply({ content: `🔍 **Treffer für** \`${q}\`\n${lines}` })
        return
      }

      if (sub === 'sync') {
        const officer = await findOfficerFromOptions(interaction)
        const result = await syncOfficer(interaction.client, officer.id)
        if (!result.applied) {
          await interaction.editReply({
            content: `⚠️ Sync übersprungen: ${result.skipped || 'unbekannt'}${result.error ? ` (${result.error})` : ''}`,
          })
          return
        }
        const addedTxt = result.added.length === 0 ? '—' : result.added.map((r) => `<@&${r}>`).join(', ')
        const removedTxt = result.removed.length === 0 ? '—' : result.removed.map((r) => `<@&${r}>`).join(', ')
        await interaction.editReply({
          content:
            `✅ **Rollen synchronisiert** für **${officer.firstName} ${officer.lastName}**\n` +
            `➕ Hinzugefügt: ${addedTxt}\n` +
            `➖ Entfernt: ${removedTxt}`,
        })
        return
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await interaction.editReply({ content: `❌ Fehler: ${msg}` })
    }
  },
}
