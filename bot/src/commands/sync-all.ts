import { SlashCommandBuilder, GuildMember, MessageFlags } from 'discord.js'
import { isAdmin } from '../permissions.js'
import { syncAll } from '../role-sync.js'
import type { BotCommand } from './index.js'

const data = new SlashCommandBuilder()
  .setName('sync-all')
  .setDescription('Discord-Rollen für ALLE Officer neu setzen (Admin)')

export const syncAllCommand: BotCommand = {
  data,
  async execute(interaction) {
    if (!isAdmin(interaction.member as GuildMember)) {
      await interaction.reply({ content: '🚫 Nur für Admins.', flags: MessageFlags.Ephemeral })
      return
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    try {
      const summary = await syncAll(interaction.client)
      await interaction.editReply({
        content:
          `🔄 **Rollen-Sync abgeschlossen**\n` +
          `Officers: **${summary.total}** · ✅ Angewendet: **${summary.applied}** · ❌ Fehler: **${summary.failed}**`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await interaction.editReply({ content: `❌ Fehler: ${msg}` })
    }
  },
}
