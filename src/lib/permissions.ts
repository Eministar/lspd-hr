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
  'academy:view',
  'academy:manage',
  'hr:view',
  'hr:manage',
  'sru:view',
  'sru:manage',
  'air-support:view',
  'air-support:manage',
  'detective:view',
  'detective:manage',
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
  'updates:send',
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
  'academy:view': 'Recruitment & Training ansehen',
  'academy:manage': 'Recruitment & Training verwalten',
  'hr:view': 'HR ansehen',
  'hr:manage': 'HR verwalten',
  'sru:view': 'S.W.U. ansehen',
  'sru:manage': 'S.W.U. verwalten',
  'air-support:view': 'Air-Support Division ansehen',
  'air-support:manage': 'Air-Support Division verwalten',
  'detective:view': 'Detective Unit ansehen',
  'detective:manage': 'Detective Unit verwalten',
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
  'updates:send': 'Updates senden',
  'password:change': 'Eigenes Passwort ändern',
}

const PERMISSION_SET = new Set<string>(PERMISSIONS)
const LEGACY_PERMISSION_MAP: Record<string, Permission[]> = {
  'tasks:view': ['academy:view', 'hr:view'],
  'tasks:manage': ['academy:manage', 'hr:manage'],
}

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
  'academy:manage': ['academy:view', 'officers:view'],
  'hr:manage': ['hr:view', 'officers:view'],
  'sru:manage': ['sru:view', 'officers:view'],
  'air-support:manage': ['air-support:view', 'officers:view'],
  'detective:manage': ['detective:view', 'officers:view'],
  'notes:manage': ['notes:view', 'officers:view'],
  'ranks:manage': ['ranks:view'],
  'trainings:manage': ['trainings:view', 'ranks:view'],
  'units:manage': ['units:view'],
  'users:manage': ['groups:manage'],
  'groups:manage': ['users:manage'],
  'settings:manage': ['dashboard:view', 'duty-times:manage', 'patrol-board:manage', 'updates:send'],
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
    } else if (typeof item === 'string' && item in LEGACY_PERMISSION_MAP) {
      for (const mapped of LEGACY_PERMISSION_MAP[item]) seen.add(mapped)
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

export function resolveEffectivePermissions(userPermissions?: unknown, groupPermissions?: unknown | unknown[]): Permission[] {
  const groupPermissionList = Array.isArray(groupPermissions) && groupPermissions.some(Array.isArray)
    ? groupPermissions.flatMap((permissions) => sanitizePermissions(permissions))
    : sanitizePermissions(groupPermissions)

  return normalizePermissions([
    ...sanitizePermissions(userPermissions),
    ...groupPermissionList,
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

/**
 * Liefert die Schnittmenge zweier Permission-Listen.
 *
 * Wird für die Discord-ID-Impersonation genutzt: Wenn ein API-Token mit
 * zusätzlichem `X-Discord-Id` Header aufgerufen wird, sind die effektiven
 * Rechte = (Token-Scopes) ∩ (User-Permissions). So kann der Token nie
 * Rechte ausüben, die der Inhaber (oder der impersonierte User) nicht hat.
 */
export function intersectPermissions(
  a: readonly Permission[],
  b: readonly Permission[],
): Permission[] {
  const setB = new Set<Permission>(b)
  return a.filter((p) => setB.has(p))
}
