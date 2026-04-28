import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js'

// We allow the broader builder type returned by addSubcommand chains.
export interface BotCommand {
  data: SlashCommandBuilder | ReturnType<SlashCommandBuilder['addSubcommand']>
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>
}

import { officerCommand } from './officer.js'
import { trainingCommand } from './training.js'
import { rankCommand } from './rank.js'
import { syncAllCommand } from './sync-all.js'
import { helpCommand } from './help.js'

export const commands: BotCommand[] = [
  officerCommand,
  trainingCommand,
  rankCommand,
  syncAllCommand,
  helpCommand,
]

export const commandsJSON = commands.map((c) => (c.data as SlashCommandBuilder).toJSON())
