import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import { backend } from '../backend.js'
import type { BotCommand } from './index.js'

const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Ränge anzeigen')
  .addSubcommand((s) => s.setName('list').setDescription('Alle Ränge + Discord-Rollen-Mapping'))

export const rankCommand: BotCommand = {
  data,
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    try {
      const ranks = await backend.listRanks()
      if (ranks.length === 0) {
        await interaction.editReply({ content: '*Keine Ränge vorhanden.*' })
        return
      }
      const lines = ranks.map(
        (r) =>
          `**${r.sortOrder}.** ${r.discordRoleId ? '🔗' : '➖'} **${r.name}**` +
          (r.discordRoleId ? ` →  <@&${r.discordRoleId}>` : '  *kein Mapping*'),
      )
      await interaction.editReply({ content: `🛡️ **Ränge**\n${lines.join('\n')}` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await interaction.editReply({ content: `❌ Fehler: ${msg}` })
    }
  },
}
