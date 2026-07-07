/**
 * Gruppierung der Audit-Log-Aktionen nach Log-Art. Wird von der API (Filter)
 * und der Protokoll-Seite (Anzeige) gemeinsam genutzt.
 */
export const AUDIT_LOG_GROUPS = {
  officer: {
    label: 'Officer',
    actions: ['OFFICER_CREATED', 'OFFICER_UPDATED', 'OFFICER_DELETED'],
  },
  rank: {
    label: 'Beförderungen & Ränge',
    actions: ['OFFICER_PROMOTED', 'OFFICER_PROMOTION_REVERTED', 'OFFICER_BADGE_REASSIGNED', 'BADGE_NUMBERS_REASSIGNED'],
  },
  termination: {
    label: 'Kündigungen',
    actions: ['OFFICER_TERMINATED'],
  },
  sanction: {
    label: 'Sanktionen',
    actions: ['OFFICER_SANCTIONED', 'SANCTION_PAID', 'SANCTION_UPDATED', 'SANCTION_DELETED', 'SANCTION_ESCALATED_MANUALLY', 'SANCTION_AUTO_ESCALATED'],
  },
  training: {
    label: 'Ausbildung',
    actions: ['TRAININGS_UPDATED'],
  },
  probation: {
    label: 'Probezeit',
    actions: ['PROBATION_STARTED', 'PROBATION_UPDATED', 'PROBATION_DELETED'],
  },
  note: {
    label: 'Notizen',
    actions: ['NOTE_ADDED', 'INACTIVITY_NOTE_DISMISSED'],
  },
  calendar: {
    label: 'Kalender',
    actions: ['CALENDAR_EVENT_CREATED', 'CALENDAR_EVENT_UPDATED', 'CALENDAR_EVENT_DELETED'],
  },
  patrol: {
    label: 'Patrol Board',
    actions: ['PATROL_BOARD_CREATED', 'PATROL_BOARD_UPDATED', 'PATROL_BOARD_DELETED'],
  },
  system: {
    label: 'System & API',
    actions: ['API_TOKEN_CREATED', 'API_TOKEN_REVOKED', 'API_TOKEN_HARD_DELETED', 'API_TOKENS_LIMIT_UPDATED'],
  },
} as const

export type AuditLogGroupKey = keyof typeof AUDIT_LOG_GROUPS

export function allGroupedActions(): string[] {
  return Object.values(AUDIT_LOG_GROUPS).flatMap((group) => [...group.actions])
}

/** Aktionen einer Gruppe; null wenn der Key keine bekannte Gruppe ist. */
export function actionsForGroup(group: string): string[] | null {
  if (!(group in AUDIT_LOG_GROUPS)) return null
  return [...AUDIT_LOG_GROUPS[group as AuditLogGroupKey].actions]
}

/** Gruppen-Key zu einer Aktion; 'other' für unbekannte Aktionen. */
export function groupForAction(action: string): AuditLogGroupKey | 'other' {
  for (const [key, group] of Object.entries(AUDIT_LOG_GROUPS)) {
    if ((group.actions as readonly string[]).includes(action)) return key as AuditLogGroupKey
  }
  return 'other'
}
