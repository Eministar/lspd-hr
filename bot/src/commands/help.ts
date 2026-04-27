import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import { helpEmbed } from '../embeds.js'
import type { BotCommand } from './index.js'

const data = new SlashCommandBuilder().setName('help').setDescription('Bot-Hilfe anzeigen')

export const helpCommand: BotCommand = {
  data,
  async execute(interaction) {
    await interaction.reply({ embeds: [helpEmbed()], flags: MessageFlags.Ephemeral })
  },
}
