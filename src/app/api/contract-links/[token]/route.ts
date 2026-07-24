import { NextRequest } from 'next/server'
import { success, error, notFound } from '@/lib/api-response'
import { getCurrentUser } from '@/lib/auth'
import { normalizeLinkToken } from '@/lib/contracts'
import { loadContractByToken, serializeContractDocument } from '@/lib/contract-links'

/**
 * Öffentlicher Vertragslink. Der Vertrag selbst wird erst herausgegeben, wenn
 * der eingeloggte Discord-Account zum Vertrag gehört — der Link allein reicht
 * nicht. Ohne Login wird bewusst 401 mit Kontext geliefert, damit die Seite
 * einen Discord-Login-Button zeigen kann statt einer nackten Fehlermeldung.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token: rawToken } = await params
    const token = normalizeLinkToken(rawToken)
    if (!token) return notFound('Vertrag')

    const contract = await loadContractByToken(token)
    if (!contract) return notFound('Vertrag')

    const user = await getCurrentUser()
    if (!user) {
      return error('Bitte melde dich mit Discord an, um deinen Vertrag zu öffnen.', 401)
    }

    if (!contract.signerDiscordId) {
      return error(
        'Für diesen Vertrag ist keine Discord-ID hinterlegt. Bitte melde dich bei der Personalabteilung.',
        409,
      )
    }

    if (user.discordId !== contract.signerDiscordId) {
      return error('Dieser Vertrag gehört zu einem anderen Discord-Account.', 403)
    }

    return success(await serializeContractDocument(contract))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    return error(msg, 500)
  }
}
