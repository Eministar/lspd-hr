export type PenalGrade = 'I' | 'II' | 'III' | 'IV' | 'V'

export interface SanctionPenaltyRule {
  grade: PenalGrade
  fineAmount: number
  penalty: string
}

export const SANCTION_CATALOG: Record<PenalGrade, SanctionPenaltyRule> = {
  I: {
    grade: 'I',
    fineAmount: 10_000,
    penalty: 'Keine weiteren Maßnahmen',
  },
  II: {
    grade: 'II',
    fineAmount: 20_000,
    penalty: 'Suspendierung bis maximal 48 Stunden möglich',
  },
  III: {
    grade: 'III',
    fineAmount: 40_000,
    penalty: 'Unbefristete Suspendierung möglich',
  },
  IV: {
    grade: 'IV',
    fineAmount: 60_000,
    penalty: 'Unbefristete Suspendierung; gegebenenfalls Entlassung',
  },
  V: {
    grade: 'V',
    fineAmount: 85_000,
    penalty: 'Entlassung',
  },
}

export const PENAL_GRADES: ReadonlySet<string> = new Set(Object.keys(SANCTION_CATALOG))

export function isPenalGrade(value: string): value is PenalGrade {
  return PENAL_GRADES.has(value)
}

export function resolveSanctionPenalty(value: string) {
  return isPenalGrade(value) ? SANCTION_CATALOG[value] : null
}

export function formatFineAmount(value: number | null) {
  if (value === null) return '—'
  return `${new Intl.NumberFormat('de-DE').format(value)} $`
}

export function penalGradeLabel(value: string) {
  return isPenalGrade(value) ? `Penal Grade ${value}` : 'Ungültiger Penal Grade'
}
