import { REST, Routes } from 'discord.js'
import { config } from './config.js'
import { commandsJSON } from './commands/index.js'

async function main() {
  const rest = new REST({ version: '10' }).setToken(config.discordToken)
  console.log(`[register] uploading ${commandsJSON.length} commands to guild ${config.guildId}…`)
  const data = await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commandsJSON },
  )
  console.log(`[register] done. ${(data as unknown[]).length} commands registered.`)
}

main().catch((err) => {
  console.error('[register] failed:', err)
  process.exit(1)
})
