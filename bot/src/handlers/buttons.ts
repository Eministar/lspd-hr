import {
  ButtonInteraction,
  GuildMember,
  MessageFlags,
} from 'discord.js'
import { backend } from '../backend.js'
import { officerInfoEmbed } from '../embeds.js'
import { officerActionRow, trainingTogglesForOfficer } from '../components.js'
import { syncOfficer } from '../role-sync.js'
import { isHR } from '../permissions.js'

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId
  const parts = id.split(':')
  const ns = parts[0]
  const action = parts[1]

  try {
    if (ns === 'officer' && action === 'sync') {
      const officerId = parts[2]
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const result = await syncOfficer(interaction.client, officerId)
      if (!result.applied) {
        await interaction.editReply({
          content: `⚠️ Sync übersprungen: ${result.skipped || 'unbekannt'}${result.error ? ` (${result.error})` : ''}`,
        })
        return
      }
      const addedTxt = result.added.length === 0 ? '—' : result.added.map((r) => `<@&${r}>`).join(', ')
      const removedTxt = result.removed.length === 0 ? '—' : result.removed.map((r) => `<@&${r}>`).join(', ')
      await interaction.editReply({
        content: `✅ Rollen synchronisiert.\n➕ ${addedTxt}\n➖ ${removedTxt}`,
      })
      return
    }

    if (ns === 'officer' && action === 'trainings') {
      const officerId = parts[2]
      if (!isHR(interaction.member as GuildMember)) {
        await interaction.reply({
          content: '🚫 Nur HR darf Ausbildungen umschalten.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }
      const officer = await backend.getOfficer(officerId)
      const rows = trainingTogglesForOfficer(officer)
      await interaction.reply({
        content:
          `🎓 **Ausbildungen für ${officer.firstName} ${officer.lastName}**\n` +
          `Klicke einen Eintrag, um den Status umzuschalten.`,
        components: rows,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (ns === 'training' && action === 'toggle') {
      const [, , officerId, key, nextStr] = parts
      if (!isHR(interaction.member as GuildMember)) {
        await interaction.reply({
          content: '🚫 Nur HR darf Ausbildungen umschalten.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }
      const next = nextStr === '1'
      await interaction.deferUpdate()
      await backend.setTraining(officerId, key, next, {
        discordId: interaction.user.id,
        displayName: interaction.user.tag,
      })
      const officer = await backend.getOfficer(officerId)
      await syncOfficer(interaction.client, officerId)
      await interaction.editReply({
        content:
          `🎓 **Ausbildungen für ${officer.firstName} ${officer.lastName}**\n` +
          `Klicke einen Eintrag, um den Status umzuschalten.`,
        components: trainingTogglesForOfficer(officer),
      })

      // Also refresh the original officer info embed if present
      if (interaction.message.embeds[0]?.title?.includes(officer.lastName)) {
        try {
          await interaction.message.edit({
            embeds: [officerInfoEmbed(officer)],
            components: officerActionRow(officer),
          })
        } catch {
          /* ignore */
        }
      }
      return
    }

    await interaction.reply({ content: '❓ Unbekannte Button-Aktion.', flags: MessageFlags.Ephemeral })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `❌ Fehler: ${msg}` })
    } else {
      await interaction.reply({ content: `❌ Fehler: ${msg}`, flags: MessageFlags.Ephemeral })
    }
  }
}
