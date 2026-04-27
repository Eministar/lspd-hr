import { GuildMember } from 'discord.js'
import { config } from './config.js'

export function isAdmin(member: GuildMember | null): boolean {
  if (!member) return false
  if (member.permissions.has('Administrator')) return true
  return config.adminRoleIds.some((rid) => member.roles.cache.has(rid))
}

export function isHR(member: GuildMember | null): boolean {
  if (!member) return false
  if (isAdmin(member)) return true
  return config.hrRoleIds.some((rid) => member.roles.cache.has(rid))
}
