import { SlashCommandBuilder, GuildMember, MessageFlags } from 'discord.js'
import { backend } from '../backend.js'
import { isHR } from '../permissions.js'
import { syncOfficer } from '../role-sync.js'
import type { BotCommand } from './index.js'

const data = new SlashCommandBuilder()
  .setName('training')
  .setDescription('Ausbildungen verwalten')
  .addSubcommand((s) => s.setName('list').setDescription('Alle Ausbildungen + Discord-Rollen-Mapping'))
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Ausbildung markieren (HR)')
      .addStringOption((o) => o.setName('officer').setDescription('Officer-ID oder Dienstnummer').setRequired(true))
      .addStringOption((o) => o.setName('key').setDescription('Ausbildungs-Key (z. B. erste_hilfe)').setRequired(true))
      .addBooleanOption((o) => o.setName('completed').setDescription('Abgeschlossen?').setRequired(true)),
  )

export const trainingCommand: BotCommand = {
  data,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    try {
      if (sub === 'list') {
        const trainings = await backend.listTrainings()
        if (trainings.length === 0) {
          await interaction.editReply({ content: '*Keine Ausbildungen vorhanden.*' })
          return
        }
        const lines = trainings.map(
          (t) =>
            `${t.discordRoleId ? '🔗' : '➖'} **${t.label}**  \`${t.key}\`` +
            (t.discordRoleId ? `  →  <@&${t.discordRoleId}>` : '  *kein Mapping*'),
        )
        await interaction.editReply({ content: `🎓 **Ausbildungen**\n${lines.join('\n')}` })
        return
      }

      if (sub === 'set') {
        if (!isHR(interaction.member as GuildMember)) {
          await interaction.editReply({ content: '🚫 Du benötigst die HR-Rolle.' })
          return
        }
        const officerArg = interaction.options.getString('officer', true)
        const key = interaction.options.getString('key', true)
        const completed = interaction.options.getBoolean('completed', true)

        // Resolve officer (id first, then by badge search)
        let officerId = officerArg
        try {
          await backend.getOfficer(officerArg)
        } catch {
          const matches = await backend.searchOfficers(officerArg, 1)
          if (matches.length === 0) {
            await interaction.editReply({ content: `❌ Officer \`${officerArg}\` nicht gefunden.` })
            return
          }
          officerId = matches[0].id
        }

        const result = await backend.setTraining(officerId, key, completed, {
          discordId: interaction.user.id,
          displayName: interaction.user.tag,
        })

        // Re-sync roles afterwards
        const sync = await syncOfficer(interaction.client, officerId)
        const syncSummary = sync.applied
          ? `🔄 Rollen aktualisiert (➕${sync.added.length} ➖${sync.removed.length})`
          : sync.skipped
            ? `⚠️ Rollen-Sync übersprungen: ${sync.skipped}`
            : ''
        await interaction.editReply({
          content:
            `${completed ? '✅' : '↩️'} Ausbildung **${result.training.label}** ${completed ? 'abgeschlossen' : 'zurückgesetzt'}.\n${syncSummary}`,
        })
        return
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await interaction.editReply({ content: `❌ Fehler: ${msg}` })
    }
  },
}
