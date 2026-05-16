export const PERMISSIONS = [
  'dashboard:view',
  'calendar:view',
  'calendar:manage',
  'duty-times:view',
  'duty-times:manage',
  'patrol-board:view',
  'patrol-board:manage',
  'officers:view',
  'officers:write',
  'officer-trainings:manage',
  'officers:delete',
  'terminations:view',
  'terminations:manage',
  'probations:view',
  'probations:manage',
  'sanctions:manage',
  'rank-changes:view',
  'rank-changes:manage',
  'rank-change-lists:execute',
  'rank-change-lists:delete',
  'tasks:view',
  'tasks:manage',
  'notes:view',
  'notes:manage',
  'logs:view',
  'exports:view',
  'ranks:view',
  'ranks:manage',
  'trainings:view',
  'trainings:manage',
  'units:view',
  'units:manage',
  'users:manage',
  'groups:manage',
  'settings:manage',
  'password:change',
  //'rank-change-lists:execute', (removed duplicate)
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard:view': 'Dashboard ansehen',
  'calendar:view': 'Kalender ansehen',
  'calendar:manage': 'Kalender verwalten',
  'duty-times:view': 'Dienstzeiten ansehen',
  'duty-times:manage': 'Dienstzeiten verwalten',
  'patrol-board:view': 'Streifenboard ansehen',
  'patrol-board:manage': 'Streifenboard verwalten',
  'officers:view': 'Officers ansehen',
  'officers:write': 'Officers bearbeiten',
  'officer-trainings:manage': 'Officer-Ausbildungen setzen',
  'officers:delete': 'Officers löschen',
  'terminations:view': 'Kündigungen ansehen',
  'terminations:manage': 'Kündigungen verwalten',
  'probations:view': 'Probezeiten ansehen',
  'probations:manage': 'Probezeiten verwalten',
  'sanctions:manage': 'Sanktionen ausstellen',
  'rank-changes:view': 'Beförderungen/Degradierungen ansehen',
  'rank-changes:manage': 'Beförderungen/Degradierungen',
  'rank-change-lists:delete': 'Beförderungs-/Degradierungslisten löschen',
  'rank-change-lists:execute': 'Beförderungen/Degradierungen durchführen',
  'tasks:view': 'Aufgaben ansehen',
  'tasks:manage': 'Aufgaben verwalten',
  'notes:view': 'Notizen ansehen',
  'notes:manage': 'Notizen verwalten',
  'logs:view': 'Protokoll ansehen',
  'exports:view': 'Exporte verwenden',
  'ranks:view': 'Ränge ansehen',
  'ranks:manage': 'Ränge verwalten',
  'trainings:view': 'Ausbildungen ansehen',
  'trainings:manage': 'Ausbildungen verwalten',
  'units:view': 'Units ansehen',
  'units:manage': 'Units verwalten',
  'users:manage': 'Benutzer verwalten',
  'groups:manage': 'Benutzergruppen verwalten',
  'settings:manage': 'Einstellungen verwalten',
  'password:change': 'Eigenes Passwort ändern',
}

const PERMISSION_SET = new Set<string>(PERMISSIONS)

const IMPLIED_PERMISSIONS: Partial<Record<Permission, Permission[]>> = {
  'dashboard:view': ['duty-times:view'],
  'calendar:manage': ['calendar:view', 'officers:view'],
  'duty-times:manage': ['duty-times:view', 'officers:view'],
  'patrol-board:view': ['officers:view', 'duty-times:view'],
  'patrol-board:manage': ['patrol-board:view', 'officers:view', 'duty-times:view'],
  'officers:write': ['officers:view', 'ranks:view', 'units:view', 'duty-times:manage'],
  'officer-trainings:manage': ['officers:view', 'trainings:view'],
  'officers:delete': ['officers:view'],
  'terminations:manage': ['terminations:view', 'officers:view'],
  'probations:manage': ['probations:view', 'officers:view'],
  'sanctions:manage': ['officers:view'],
  // Backward-compatibility: managing rank changes should include ability to execute rank-change-lists
  'rank-changes:manage': ['rank-changes:view', 'officers:view', 'ranks:view', 'rank-change-lists:execute'],
  'rank-change-lists:execute': ['rank-changes:view', 'officers:view', 'ranks:view'],
  'tasks:manage': ['tasks:view', 'officers:view'],
  'notes:manage': ['notes:view', 'officers:view'],
  'ranks:manage': ['ranks:view'],
  'trainings:manage': ['trainings:view', 'ranks:view'],
  'units:manage': ['units:view'],
  'users:manage': ['groups:manage'],
  'groups:manage': ['users:manage'],
  'settings:manage': ['dashboard:view', 'duty-times:manage', 'patrol-board:manage'],
}

// Filter to known permissions WITHOUT expanding implied permissions.
// Used at write time so the admin's selection is persisted exactly as chosen
// (otherwise unchecking an implied permission while keeping its parent
// silently re-adds it on save).
export function sanitizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<Permission>()
  for (const item of value) {
    if (typeof item === 'string' && PERMISSION_SET.has(item)) {
      seen.add(item as Permission)
    }
  }
  return Array.from(seen)
}

// Filter to known permissions AND expand implied permissions.
// Used at read/check time so e.g. having `rank-changes:manage` automatically
// grants `officers:view` for runtime permission checks.
export function normalizePermissions(value: unknown): Permission[] {
  const explicit = sanitizePermissions(value)
  const permissions = new Set<Permission>(explicit)
  for (const permission of explicit) {
    for (const implied of IMPLIED_PERMISSIONS[permission] ?? []) {
      permissions.add(implied)
    }
  }
  return Array.from(permissions)
}

export function resolvePermissions(groupPermissions?: unknown): Permission[] {
  return normalizePermissions(groupPermissions)
}

export function resolveEffectivePermissions(userPermissions?: unknown, groupPermissions?: unknown): Permission[] {
  return normalizePermissions([
    ...sanitizePermissions(groupPermissions),
    ...sanitizePermissions(userPermissions),
  ])
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
