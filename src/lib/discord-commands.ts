import { getDiscordConfig } from './discord-integration'

const STRING = 3
const BOOLEAN = 5
const USER = 6

export const DISCORD_COMMANDS = [
  {
    name: 'lspd-einstellung',
    description: 'Stellt einen Officer ein und sendet die HR-Meldung.',
    options: [
      { type: USER, name: 'discord', description: 'Discord-User', required: true },
      { type: STRING, name: 'vorname', description: 'Vorname', required: true },
      { type: STRING, name: 'nachname', description: 'Nachname', required: true },
      { type: STRING, name: 'rang', description: 'Rang', required: true, autocomplete: true },
      { type: STRING, name: 'dienstnummer', description: 'Dienstnummer, leer für automatisch', required: false },
      { type: STRING, name: 'units', description: 'Units, mit Komma getrennt', required: false },
    ],
  },
  {
    name: 'lspd-beförderung',
    description: 'Ändert den Rang eines Officers und meldet die Beförderung oder Degradierung.',
    options: [
      { type: USER, name: 'discord', description: 'Discord-User des Officers', required: true },
      { type: STRING, name: 'rang', description: 'Neuer Rang', required: true, autocomplete: true },
      { type: STRING, name: 'dienstnummer', description: 'Neue Dienstnummer, leer für automatisch', required: false },
      { type: STRING, name: 'notiz', description: 'Interne Notiz', required: false },
    ],
  },
  {
    name: 'lspd-ausbildung',
    description: 'Setzt eine Ausbildung auf abgeschlossen oder offen.',
    options: [
      { type: USER, name: 'discord', description: 'Discord-User des Officers', required: true },
      { type: STRING, name: 'ausbildung', description: 'Ausbildung', required: true, autocomplete: true },
      { type: BOOLEAN, name: 'abgeschlossen', description: 'Abgeschlossen?', required: true },
    ],
  },
  {
    name: 'lspd-unit',
    description: 'Setzt oder ändert die Unit-Zuordnung eines Officers.',
    options: [
      { type: USER, name: 'discord', description: 'Discord-User des Officers', required: true },
      {
        type: STRING,
        name: 'aktion',
        description: 'Wie soll die Unit geändert werden?',
        required: true,
        choices: [
          { name: 'setzen', value: 'set' },
          { name: 'hinzufügen', value: 'add' },
          { name: 'entfernen', value: 'remove' },
        ],
      },
      { type: STRING, name: 'unit', description: 'Unit', required: true, autocomplete: true },
    ],
  },
  {
    name: 'lspd-kündigung',
    description: 'Kündigt einen Officer, meldet die Kündigung und entfernt konfigurierte Rollen.',
    options: [
      { type: USER, name: 'discord', description: 'Discord-User des Officers', required: true },
      { type: STRING, name: 'grund', description: 'Grund', required: true },
    ],
  },
]

function botToken() {
  return process.env.DISCORD_BOT_TOKEN?.trim() || process.env.LSPD_DISCORD_BOT_TOKEN?.trim() || ''
}

export async function registerDiscordCommands() {
  const config = await getDiscordConfig()
  const token = botToken()
  if (!token) throw new Error('Discord Bot-Token fehlt')
  if (!config.guildId) throw new Error('Discord Guild-ID fehlt')
  if (!config.applicationId) throw new Error('Discord Application-ID fehlt')

  const res = await fetch(
    `https://discord.com/api/v10/applications/${config.applicationId}/guilds/${config.guildId}/commands`,
    {
      method: 'PUT',
      headers: {
        authorization: `Bot ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(DISCORD_COMMANDS),
      signal: AbortSignal.timeout(10000),
    },
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Discord Command-Registrierung fehlgeschlagen: ${res.status} ${text}`)
  }

  return res.json() as Promise<unknown>
}
