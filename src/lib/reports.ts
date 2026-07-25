// Client-sicher: keine Node-/Prisma-Imports. Die Serverseite (Aktenzeichen
// vergeben, Datenbankzugriff) liegt in `report-service.ts`.

export const REPORT_CASE_PREFIX = 'AZ-'
export const PERSON_FILE_PREFIX = 'PA-'

export const REPORT_STATUSES = [
  'RECORDED',
  'IN_REVIEW',
  'FORWARDED',
  'IN_COURT',
  'CLOSED',
  'DISMISSED',
] as const

export type ReportStatusValue = (typeof REPORT_STATUSES)[number]

export const REPORT_STATUS_META: Record<
  ReportStatusValue,
  {
    label: string
    shortLabel: string
    description: string
    variant: 'default' | 'success' | 'warning' | 'danger' | 'info'
  }
> = {
  RECORDED: {
    label: 'Aufgenommen',
    shortLabel: 'Neu',
    description: 'Die Anzeige wurde aufgenommen und liegt zur Bearbeitung bereit.',
    variant: 'info',
  },
  IN_REVIEW: {
    label: 'In Bearbeitung',
    shortLabel: 'In Arbeit',
    description: 'Die Anzeige wird derzeit vom Department bearbeitet.',
    variant: 'warning',
  },
  FORWARDED: {
    label: 'An FJD übergeben',
    shortLabel: 'FJD',
    description: 'Die Anzeige wurde an den Fach- und Justizdienst übergeben.',
    variant: 'warning',
  },
  IN_COURT: {
    label: 'Bei Gericht',
    shortLabel: 'Gericht',
    description: 'Der Vorgang liegt beim Gericht.',
    variant: 'warning',
  },
  CLOSED: {
    label: 'Abgeschlossen',
    shortLabel: 'Erledigt',
    description: 'Der Vorgang ist abgeschlossen.',
    variant: 'success',
  },
  DISMISSED: {
    label: 'Eingestellt',
    shortLabel: 'Eingestellt',
    description: 'Das Verfahren wurde eingestellt oder die Anzeige abgewiesen.',
    variant: 'danger',
  },
}

/** Status, bei denen der Vorgang noch läuft. */
export const OPEN_REPORT_STATUSES: ReportStatusValue[] = [
  'RECORDED',
  'IN_REVIEW',
  'FORWARDED',
  'IN_COURT',
]

export function isReportStatus(value: unknown): value is ReportStatusValue {
  return typeof value === 'string' && (REPORT_STATUSES as readonly string[]).includes(value)
}

export function cleanReportText(value: unknown, maxLength = 191) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function cleanReportLongText(value: unknown, maxLength = 8000) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

/**
 * Bild-URLs werden nur akzeptiert, wenn sie auf den eigenen Upload-Ordner
 * zeigen. Fremde URLs würden sonst Inhalte aus dem Internet in die Akte
 * einbetten — inklusive Tracking beim Betrachter.
 */
export function cleanImageUrl(value: unknown) {
  const url = cleanReportText(value, 500)
  if (!url) return ''
  return /^\/uploads\/[A-Za-z0-9._-]+$/.test(url) ? url : ''
}

export interface ReportAttachment {
  id: string
  url: string
  label: string
}

export function sanitizeReportAttachments(value: unknown): ReportAttachment[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const raw = item as Record<string, unknown>
      const url = cleanImageUrl(raw.url)
      if (!url) return null
      return {
        id: cleanReportText(raw.id, 40) || `bild_${index + 1}`,
        url,
        label: cleanReportText(raw.label, 120) || `Beweisbild ${index + 1}`,
      }
    })
    .filter((item): item is ReportAttachment => Boolean(item))
    .slice(0, 12)
}

export function personDisplayName(person: { firstName?: string | null; lastName?: string | null } | null | undefined) {
  if (!person) return ''
  return `${person.firstName ?? ''} ${person.lastName ?? ''}`.replace(/\s+/g, ' ').trim()
}

/** Zerlegt eine freie Namenseingabe in Vor- und Nachname. */
export function splitPersonName(value: unknown) {
  const parts = cleanReportText(value, 160).split(' ').filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}
