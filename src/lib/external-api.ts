/**
 * Externe, schreibgeschützte Officer-API für das FIB-Dashboard.
 *
 * Abgesichert über ein gemeinsames Secret (`FIB_API_SECRET`) im Header
 * `x-api-secret` – unabhängig von Logins und `lspd_…`-Tokens. Ohne gesetztes
 * Secret ist die API abgeschaltet. Ausgegeben werden nur bewusst gewählte
 * Felder; interne Notizen, Flags und Bearbeiter bleiben im Panel.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

import { stripTerminatedBadgeNumber } from '@/lib/badge-number'

export const EXTERNAL_SECRET_HEADER = 'x-api-secret'
const MIN_SECRET_LENGTH = 24

export function externalApiSecret(env: NodeJS.ProcessEnv = process.env) {
  const value = env.FIB_API_SECRET?.trim() || env.LSPD_EXTERNAL_API_SECRET?.trim() || ''
  return value.length >= MIN_SECRET_LENGTH ? value : null
}

/**
 * Vergleich in konstanter Zeit. Über SHA-256 normiert, damit auch die Länge
 * des eingereichten Werts nichts verrät.
 */
export function verifyExternalSecret(provided: string | null | undefined, expected: string | null) {
  if (!expected || !provided) return false
  const a = createHash('sha256').update(provided.trim()).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export const EXTERNAL_LIST_LIMIT_MAX = 100

export function parseListLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 25
  return Math.min(parsed, EXTERNAL_LIST_LIMIT_MAX)
}

const STATUSES = ['ACTIVE', 'AWAY', 'INACTIVE', 'TERMINATED'] as const
export type ExternalOfficerStatus = (typeof STATUSES)[number]

export function parseStatusFilter(value: string | null): ExternalOfficerStatus[] | null {
  if (!value) return null
  const list = value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is ExternalOfficerStatus => (STATUSES as readonly string[]).includes(item))
  return list.length > 0 ? list : null
}

export interface ExternalOfficer {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string
  discordId: string | null
  status: string
  rank: { name: string; color: string; sortOrder: number }
  units: { key: string; name: string }[]
  hireDate: string
}

export interface ExternalOfficerFile extends ExternalOfficer {
  promotions: { at: string; fromRank: string; toRank: string; fromBadge: string | null; toBadge: string | null; note: string | null }[]
  sanctions: {
    at: string
    reason: string
    penalGrade: string
    measureType: string
    status: string
    fineAmount: number | null
    penalty: string | null
  }[]
  trainings: { label: string; completed: boolean }[]
  terminations: { at: string; reason: string }[]
}

export interface OfficerRow {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string
  discordId: string | null
  status: string
  unit: string | null
  units: unknown
  hireDate: Date
  rank: { name: string; color: string; sortOrder: number }
}

function unitKeys(row: Pick<OfficerRow, 'units' | 'unit'>) {
  const list = Array.isArray(row.units)
    ? row.units.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : []
  if (list.length > 0) return [...new Set(list)]
  return row.unit ? [row.unit] : []
}

export function toExternalOfficer(row: OfficerRow, unitNames: ReadonlyMap<string, string>): ExternalOfficer {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    // Gekündigte tragen intern „<DN>__terminated__<id>“ – nach außen nur die Dienstnummer.
    badgeNumber: stripTerminatedBadgeNumber(row.badgeNumber),
    discordId: row.discordId,
    status: row.status,
    rank: { name: row.rank.name, color: row.rank.color, sortOrder: row.rank.sortOrder },
    units: unitKeys(row).map((key) => ({ key, name: unitNames.get(key) ?? key })),
    hireDate: row.hireDate.toISOString(),
  }
}
