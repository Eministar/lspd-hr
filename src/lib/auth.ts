import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { cookies, headers } from 'next/headers'
import { prisma } from './prisma'
import { hasAnyPermission, resolveEffectivePermissions, intersectPermissions, PERMISSIONS, type Permission } from './permissions'
import { storedDiscordAvatarUrl } from './discord-auth'
import { isDiscordUserAdmin } from './discord-integration'
import { createHash } from 'node:crypto'
import { resolveUserDisplayName } from './user-display-name'

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
  avatarUrl: string | null
  groups: { id: string; name: string }[]
  permissions: Permission[]
}

export type AuthKind = 'cookie' | 'api'

export interface CurrentAuth {
  kind: AuthKind
  user: CurrentUser
  /** Nur gesetzt, wenn kind === 'api'. */
  api?: {
    tokenId: string
    tokenName: string
    tokenPrefix: string
    tokenOwnerDisplayName: string
    scopes: Permission[]
  }
  /**
   * Gesetzt, wenn ein API-Token-Request den `X-Discord-Id` Header trägt
   * (Impersonation). Die effektiven Rechte sind in diesem Fall die
   * Schnittmenge aus Token-Scopes und den Rechten des impersonierten Users.
   */
  impersonation?: {
    discordId: string
    userId: string
    displayName: string
  }
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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function extractBearer(authorization: string | null | undefined): string | null {
  if (!authorization) return null
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim())
  return match ? match[1] : null
}

/**
 * Authentifiziert aus Cookie ODER `Authorization: Bearer lspd_…`.
 * Liefert `null`, wenn nichts Authentifiziertes gefunden wurde.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const auth = await getCurrentAuth()
  return auth?.user ?? null
}

/**
 * Wie {@link getCurrentUser}, liefert aber zusätzlich den Auth-Kontext
 * (Cookie vs. API-Token) — nützlich für Usage-Tracking und Rate-Limiting.
 */
export async function getCurrentAuth(): Promise<CurrentAuth | null> {
  const cookieStore = await cookies()
  const headerStore = await headers()

  const bearer = extractBearer(headerStore.get('authorization'))
  if (bearer && bearer.startsWith('lspd_')) {
    const tokenHash = sha256(bearer)
    const row = await prisma.apiToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })
    if (row && !row.revokedAt && (!row.expiresAt || row.expiresAt.getTime() > Date.now()) && row.user) {
      const tokenScopes = effectiveTokenScopes(row.scopes, await loadUserPermissions(row.userId))

      // Optional: X-Discord-Id-Header = "handle als dieser User"
      // → effektive Rechte = intersect(token-scopes, user-permissions)
      const impersonateDiscordId = headerStore.get('x-discord-id')?.trim()
      let effectiveScopes = tokenScopes
      let effectiveUser: CurrentUser | null = null
      let impersonation: CurrentAuth['impersonation'] | undefined

      if (impersonateDiscordId) {
        if (!/^\d{17,22}$/.test(impersonateDiscordId)) return null
        const impersonated = await loadUserByDiscordId(impersonateDiscordId)
        if (!impersonated) return null
        effectiveScopes = intersectPermissions(tokenScopes, impersonated.permissions)
        effectiveUser = {
          ...impersonated,
          groups: [{ id: 'api-token', name: 'API-Token' }],
          permissions: effectiveScopes,
        }
        impersonation = {
          discordId: impersonateDiscordId,
          userId: impersonated.id,
          displayName: impersonated.displayName,
        }
      } else {
        effectiveUser = buildApiUser(row.user, tokenScopes)
      }

      if (!effectiveUser) return null

      return {
        kind: 'api',
        user: effectiveUser,
        api: {
          tokenId: row.id,
          tokenName: row.name,
          tokenPrefix: row.prefix,
          tokenOwnerDisplayName: row.user.displayName,
          scopes: effectiveScopes,
        },
        impersonation,
      }
    }
    return null
  }

  const cookieToken = cookieStore.get('auth-token')?.value
  if (cookieToken) {
    const payload = verifyToken(cookieToken)
    if (payload) {
      const user = await loadUserForAuth(payload.userId)
      if (user) return { kind: 'cookie', user }
    }
  }

  return null
}

/**
 * Lädt einen User per Discord-Snowflake inkl. effektiver Permissions + Gruppen.
 * Liefert `null`, wenn kein User mit dieser Discord-ID existiert.
 */
async function loadUserByDiscordId(discordId: string): Promise<CurrentUser | null> {
  const user = await prisma.user.findFirst({
    where: { discordId },
    select: {
      id: true,
      username: true,
      displayName: true,
      discordId: true,
      discordAvatar: true,
      discordDiscriminator: true,
      permissions: true,
      group: { select: { id: true, name: true, permissions: true } },
      groupMemberships: {
        select: { group: { select: { id: true, name: true, permissions: true } } },
      },
    },
  })
  if (!user) return null

  const groupsById = new Map(user.groupMemberships.map((m) => [m.group.id, m.group]))
  if (user.group && !groupsById.has(user.group.id)) groupsById.set(user.group.id, user.group)
  const groups = Array.from(groupsById.values())
  const permissions = resolveEffectivePermissions(
    user.permissions,
    groups.map((g) => g.permissions),
  )
  const displayName = await resolveUserDisplayName(user)

  return {
    id: user.id,
    username: user.username,
    displayName,
    discordId: user.discordId,
    avatarUrl: storedDiscordAvatarUrl(user),
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    permissions,
  }
}

async function loadUserForAuth(userId: string): Promise<CurrentUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      discordId: true,
      discordAvatar: true,
      discordDiscriminator: true,
      permissions: true,
      group: { select: { id: true, name: true, permissions: true } },
      groupMemberships: {
        select: { group: { select: { id: true, name: true, permissions: true } } },
      },
    },
  })
  if (!user) return null

  const groupsById = new Map(user.groupMemberships.map((m) => [m.group.id, m.group]))
  if (user.group && !groupsById.has(user.group.id)) groupsById.set(user.group.id, user.group)
  const groups = Array.from(groupsById.values())

  let effectivePermissions = resolveEffectivePermissions(
    user.permissions,
    groups.map((g) => g.permissions),
  )
  const groupList = groups.map((g) => ({ id: g.id, name: g.name }))

  if (groups.some((g) => ['admin', 'administration'].includes(g.name.toLowerCase()))) {
    effectivePermissions = [...PERMISSIONS]
  }

  if (user.discordId && (await isDiscordUserAdmin(user.discordId))) {
    effectivePermissions = [...PERMISSIONS]
    if (!groupList.some((g) => g.name.toLowerCase() === 'admin')) {
      groupList.unshift({ id: 'discord-admin', name: 'Admin' })
    }
  }
  const displayName = await resolveUserDisplayName(user)

  return {
    id: user.id,
    username: user.username,
    displayName,
    discordId: user.discordId,
    avatarUrl: storedDiscordAvatarUrl(user),
    groups: groupList,
    permissions: effectivePermissions,
  }
}

async function loadUserPermissions(userId: string): Promise<Permission[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      permissions: true,
      groupMemberships: { select: { group: { select: { permissions: true } } } },
    },
  })
  if (!user) return []
  return resolveEffectivePermissions(
    user.permissions,
    user.groupMemberships.map((m) => m.group.permissions),
  )
}

function effectiveTokenScopes(raw: unknown, userPermissions: Permission[]): Permission[] {
  const explicit = Array.isArray(raw) ? (raw as Permission[]) : []
  if (explicit.length === 0) return userPermissions
  const userSet = new Set(userPermissions)
  return explicit.filter((s) => userSet.has(s))
}

function buildApiUser(
  user: { id: string; username: string; displayName: string; discordId: string | null; discordAvatar: string | null; discordDiscriminator: string | null },
  scopes: Permission[],
): CurrentUser {
  let avatarUrl: string | null = null
  if (user.discordId) {
    if (user.discordAvatar) {
      const ext = user.discordAvatar.startsWith('a_') ? 'gif' : 'png'
      avatarUrl = `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.${ext}?size=96`
    } else {
      const parsed = Number.parseInt(user.discordDiscriminator || '', 10)
      const idx = Number.isFinite(parsed) && parsed > 0
        ? parsed % 5
        : user.discordId.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 6
      avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`
    }
  }
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    discordId: user.discordId,
    avatarUrl,
    groups: [{ id: 'api-token', name: 'API-Token' }],
    permissions: scopes,
  }
}

export async function requireAuth(allowedRoles?: string[], allowedPermissions?: Permission[]) {
  const auth = await getCurrentAuth()
  if (!auth) throw new Error('Unauthorized')
  const user = auth.user

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
  const auth = await getCurrentAuth()
  if (!auth) throw new Error('Unauthorized')
  const list = Array.isArray(permissions) ? permissions : [permissions]
  if (!hasAnyPermission(auth.user, list)) throw new Error('Forbidden')
  return auth.user
}

/**
 * Wie {@link requirePermission}, liefert aber zusätzlich den Auth-Kontext
 * (nützlich für Token-Usage-Tracking nach dem Request).
 */
export async function requireAuthContext(permissions: Permission | Permission[]) {
  const auth = await getCurrentAuth()
  if (!auth) throw new Error('Unauthorized')
  const list = Array.isArray(permissions) ? permissions : [permissions]
  if (!hasAnyPermission(auth.user, list)) throw new Error('Forbidden')
  return auth
}
