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
  group: { id: string; name: string } | null
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
    },
  })

  if (!user) return null
  
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    discordId: user.discordId,
    group: user.group ? { id: user.group.id, name: user.group.name } : null,
    permissions: resolveEffectivePermissions(user.permissions, user.group?.permissions),
  } satisfies CurrentUser
}

export async function requireAuth(allowedRoles?: string[], allowedPermissions?: Permission[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  // If allowedRoles is provided, allow when the user's group name matches any of them.
  // This keeps backward compatibility where routes could pass role names like 'ADMIN' or 'HR'.
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    const groupName = user.group?.name
    if (groupName) {
      const groupLower = groupName.toLowerCase()
      const allowedLower = allowedRoles.map((r) => String(r).toLowerCase())
      if (allowedLower.includes(groupLower)) return user
    }
  }

  // If allowedPermissions is provided, require at least one of the permissions.
  if (Array.isArray(allowedPermissions) && allowedPermissions.length > 0) {
    const permissionAllowed = hasAnyPermission(user, allowedPermissions)
    if (!permissionAllowed) throw new Error('Forbidden')
  }

  return user
}

export async function requirePermission(permissions: Permission | Permission[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  const list = Array.isArray(permissions) ? permissions : [permissions]
  if (!hasAnyPermission(user, list)) throw new Error('Forbidden')
  return user
}
