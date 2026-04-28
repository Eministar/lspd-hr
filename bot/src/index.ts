import { Client, GatewayIntentBits, Partials, ActivityType, Events } from 'discord.js'
import { config } from './config.js'
import { commands } from './commands/index.js'
import { handleButton } from './handlers/buttons.js'
import { startHttpServer } from './http-server.js'

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
})

const commandMap = new Map(commands.map((c) => [(c.data as { name: string }).name, c]))

client.once(Events.ClientReady, (c) => {
  console.log(`[bot] ready as ${c.user.tag} (${c.user.id})`)
  c.user.setPresence({
    activities: [{ name: 'LSPD HR-System', type: ActivityType.Watching }],
    status: 'online',
  })
})

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commandMap.get(interaction.commandName)
      if (!cmd) return
      await cmd.execute(interaction)
      return
    }
    if (interaction.isButton()) {
      await handleButton(interaction)
      return
    }
  } catch (err) {
    console.error('[bot] interaction handler crashed:', err)
  }
})

startHttpServer(client)

client.login(config.discordToken).catch((err) => {
  console.error('[bot] login failed:', err)
  process.exit(1)
})

process.on('SIGINT', () => {
  console.log('[bot] shutting down...')
  client.destroy().finally(() => process.exit(0))
})
