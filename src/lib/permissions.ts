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

export function normalizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is Permission => (
    typeof item === 'string' && PERMISSION_SET.has(item)
  ))))
}

export function resolvePermissions(groupPermissions?: unknown): Permission[] {
  return normalizePermissions(groupPermissions)
}

export function hasPermission(
  user: { permissions?: string[] | null } | null | undefined,
  permission: Permission,
) {
  if (!user) return false
  return Array.isArray(user.permissions) && user.permissions.includes(permission)
}

export function hasAnyPermission(
  user: { permissions?: string[] | null } | null | undefined,
  permissions: Permission[],
) {
  return permissions.some((permission) => hasPermission(user, permission))
}
