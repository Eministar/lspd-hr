export { EmbedBuilder } from 'discord.js'

export function hexColorToInt(hex: string | null | undefined): number | null {
  if (!hex) return null
  const cleaned = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null
  return parseInt(cleaned, 16)
}
