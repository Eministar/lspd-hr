import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { prisma } from './prisma'
import { hasAnyPermission, resolveEffectivePermissions, type Permission } from './permissions'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret'

export interface JWTPayload {
  userId: string
  username: string
}

export interface CurrentUser {
  id: string
  username: string
  displayName: string
  discordId: string | null
  groups: { id: string; name: string }[]
  permissions: Permission[]
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch {
    return null
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth-token')?.value
  if (!token) return null
  
  const payload = verifyToken(token)
  if (!payload) return null
  
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      discordId: true,
      permissions: true,
      group: { select: { id: true, name: true, permissions: true } },
      groupMemberships: {
        select: {
          group: { select: { id: true, name: true, permissions: true } },
        },
      },
    },
  })

  if (!user) return null

  const groupsById = new Map(user.groupMemberships.map((membership) => [membership.group.id, membership.group]))
  if (user.group && !groupsById.has(user.group.id)) groupsById.set(user.group.id, user.group)
  const groups = Array.from(groupsById.values())
  
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    discordId: user.discordId,
    groups: groups.map((group) => ({ id: group.id, name: group.name })),
    permissions: resolveEffectivePermissions(user.permissions, groups.map((group) => group.permissions)),
  } satisfies CurrentUser
}

export async function requireAuth(allowedRoles?: string[], allowedPermissions?: Permission[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const hasRoles = Array.isArray(allowedRoles) && allowedRoles.length > 0
  const hasPermissions = Array.isArray(allowedPermissions) && allowedPermissions.length > 0

  if (!hasRoles && !hasPermissions) return user

  if (hasRoles) {
    const allowedLower = allowedRoles!.map((r) => String(r).toLowerCase())
    if (user.groups.some((group) => allowedLower.includes(group.name.toLowerCase()))) return user
  }

  if (hasPermissions && hasAnyPermission(user, allowedPermissions!)) return user

  throw new Error('Forbidden')
}

export async function requirePermission(permissions: Permission | Permission[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  const list = Array.isArray(permissions) ? permissions : [permissions]
  if (!hasAnyPermission(user, list)) throw new Error('Forbidden')
  return user
}
