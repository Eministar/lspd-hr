import { z } from 'zod'

export const suspensionSchema = z.object({
  durationHours: z.number().int().min(1).max(8760),
  reason: z.string().trim().max(2000).optional().default(''),
})

export type SuspensionSource = {
  suspendedUntil?: Date | string | null
  status?: string | null
}

export function isSuspended(officer: SuspensionSource, now = Date.now()) {
  return officer.status !== 'TERMINATED' && !!officer.suspendedUntil &&
    new Date(officer.suspendedUntil).getTime() > now
}
