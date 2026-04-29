export const PERMISSIONS = [
  'officers:write',
  'officers:delete',
  'terminations:manage',
  'rank-changes:manage',
  'tasks:manage',
  'notes:manage',
  'logs:view',
  'ranks:manage',
  'trainings:manage',
  'units:manage',
  'users:manage',
  'groups:manage',
  'settings:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<Permission, string> = {
  'officers:write': 'Officers bearbeiten',
  'officers:delete': 'Officers löschen',
  'terminations:manage': 'Kündigungen verwalten',
  'rank-changes:manage': 'Beförderungen/Degradierungen',
  'tasks:manage': 'Aufgaben verwalten',
  'notes:manage': 'Notizen verwalten',
  'logs:view': 'Protokoll ansehen',
  'ranks:manage': 'Ränge verwalten',
  'trainings:manage': 'Ausbildungen verwalten',
  'units:manage': 'Units verwalten',
  'users:manage': 'Benutzer verwalten',
  'groups:manage': 'Benutzergruppen verwalten',
  'settings:manage': 'Einstellungen verwalten',
}

const PERMISSION_SET = new Set<string>(PERMISSIONS)

const ROLE_PERMISSION_MAP: Record<string, Permission[]> = {
  ADMIN: [...PERMISSIONS],
  HR: [
    'officers:write',
    'terminations:manage',
    'rank-changes:manage',
    'tasks:manage',
    'notes:manage',
    'logs:view',
  ],
  LEADERSHIP: ['tasks:manage', 'notes:manage', 'logs:view'],
  READONLY: [],
}

export function normalizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is Permission => (
    typeof item === 'string' && PERMISSION_SET.has(item)
  ))))
}

export function getRolePermissions(role: string): Permission[] {
  return ROLE_PERMISSION_MAP[role] ?? []
}

export function resolvePermissions(role: string, groupPermissions?: unknown): Permission[] {
  if (role === 'ADMIN') return [...PERMISSIONS]
  return Array.from(new Set([
    ...getRolePermissions(role),
    ...normalizePermissions(groupPermissions),
  ]))
}

export function hasPermission(
  user: { role: string; permissions?: string[] | null } | null | undefined,
  permission: Permission,
) {
  if (!user) return false
  if (user.role === 'ADMIN') return true
  return Array.isArray(user.permissions) && user.permissions.includes(permission)
}

export function hasAnyPermission(
  user: { role: string; permissions?: string[] | null } | null | undefined,
  permissions: Permission[],
) {
  return permissions.some((permission) => hasPermission(user, permission))
}
