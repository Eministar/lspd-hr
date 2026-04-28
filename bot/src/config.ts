import 'dotenv/config'

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value.trim()
}

function list(name: string): string[] {
  const v = process.env[name]
  if (!v) return []
  return v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

export const config = {
  discordToken: required('DISCORD_TOKEN', process.env.DISCORD_TOKEN),
  clientId: required('DISCORD_CLIENT_ID', process.env.DISCORD_CLIENT_ID),
  guildId: required('DISCORD_GUILD_ID', process.env.DISCORD_GUILD_ID),

  backendUrl: required('BACKEND_URL', process.env.BACKEND_URL).replace(/\/$/, ''),
  backendApiKey: required('BACKEND_API_KEY', process.env.BACKEND_API_KEY),

  httpPort: parseInt(process.env.HTTP_PORT || '4747', 10),
  httpPublicUrl: process.env.HTTP_PUBLIC_URL || `http://localhost:${process.env.HTTP_PORT || '4747'}`,

  hrRoleIds: list('HR_ROLE_IDS'),
  adminRoleIds: list('ADMIN_ROLE_IDS'),

  brand: {
    name: 'LSPD HR',
    color: 0xd4af37,
    promotionColor: 0x34d399,
    demotionColor: 0xf97316,
    terminationColor: 0xef4444,
    trainingColor: 0x38bdf8,
    iconUrl: process.env.BRAND_ICON_URL || '',
  },
}
