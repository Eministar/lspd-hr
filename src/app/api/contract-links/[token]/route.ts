import { NextRequest } from 'next/server'
import { success, error, notFound } from '@/lib/api-response'
import { normalizeLinkToken } from '@/lib/contracts'
import {
  loadContractByToken,
  resolveContractAccess,
  serializeContractDocument,
} from '@/lib/contract-links'

/**
 * Vertragslink.
 *
 * Wer den Link hat, darf den Vertrag öffnen und unterschreiben — ohne Login.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token: rawToken } = await params
    const token = normalizeLinkToken(rawToken)
    if (!token) return notFound('Vertrag')

    const contract = await loadContractByToken(token)
    if (!contract) return notFound('Vertrag')

    const access = await resolveContractAccess()
    if (!access.ok) return error(access.message, access.status)

    return success(await serializeContractDocument(contract, access.access))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    return error(msg, 500)
  }
}
