import { NextRequest } from 'next/server'

import { error } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import {
  EXTERNAL_SECRET_HEADER,
  externalApiSecret,
  verifyExternalSecret,
} from '@/lib/external-api'

export const externalOfficerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  badgeNumber: true,
  discordId: true,
  status: true,
  unit: true,
  units: true,
  hireDate: true,
  rank: { select: { name: true, color: true, sortOrder: true } },
} as const

/**
 * Prüft das Secret. Liefert eine Fehlerantwort oder `null`, wenn der Aufruf
 * zulässig ist. 503 statt 401, solange kein Secret konfiguriert ist – dann ist
 * die Schnittstelle schlicht abgeschaltet.
 */
export function rejectExternalRequest(req: NextRequest) {
  const secret = externalApiSecret()
  if (!secret) return error('Externe API ist nicht konfiguriert', 503)
  if (!verifyExternalSecret(req.headers.get(EXTERNAL_SECRET_HEADER), secret)) {
    return error('Nicht autorisiert', 401)
  }
  return null
}

export async function unitNameMap() {
  const units = await prisma.unit.findMany({ select: { key: true, name: true } })
  return new Map(units.map((unit) => [unit.key, unit.name]))
}

/** Antworten nie zwischenspeichern und nicht indexieren. */
export function noStore<T extends Response>(response: T) {
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}
