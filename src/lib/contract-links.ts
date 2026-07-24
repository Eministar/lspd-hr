import { prisma } from '@/lib/prisma'
import { getBadgePrefix } from '@/lib/settings-helpers'
import {
  CONTRACT_PLACE,
  applyContractDatePlaceholders,
  readContractClauses,
  readContractFields,
  readContractValues,
} from '@/lib/contracts'

const contractLinkSelect = {
  id: true,
  token: true,
  title: true,
  content: true,
  clauses: true,
  closing: true,
  fields: true,
  values: true,
  status: true,
  signerDiscordId: true,
  sentAt: true,
  signedAt: true,
  signedName: true,
  declinedAt: true,
  declineReason: true,
  createdAt: true,
  officer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      badgeNumber: true,
      discordId: true,
      hireDate: true,
      rank: { select: { name: true } },
    },
  },
}

export type ContractLinkRecord = NonNullable<Awaited<ReturnType<typeof loadContractByToken>>>

/**
 * Sucht den Vertrag zum Link-Token. MySQL vergleicht Strings mit der
 * Standard-Kollation case-insensitiv — deshalb wird zusätzlich exakt
 * nachgeprüft, damit ein Token nicht durch abweichende Groß-/Kleinschreibung
 * auf einen fremden Vertrag zeigen kann.
 */
export async function loadContractByToken(token: string) {
  if (!token) return null

  const contract = await prisma.contract.findUnique({
    where: { token },
    select: contractLinkSelect,
  })
  if (!contract) return null
  if (contract.token !== token) return null

  return contract
}

/**
 * Bereitet den Vertrag für die Anzeige auf: Ort und Datum werden erst hier
 * eingesetzt, damit auf einem noch offenen Vertrag immer das aktuelle Datum
 * steht. Ein unterschriebener Vertrag friert stattdessen das Unterschriftsdatum
 * ein.
 */
export async function serializeContractDocument(contract: ContractLinkRecord) {
  const documentDate = contract.signedAt ?? new Date()
  const resolve = (value: string | null | undefined) =>
    value ? applyContractDatePlaceholders(value, documentDate) : ''

  const prefix = await getBadgePrefix()
  const badge = contract.officer.badgeNumber
  const badgeLabel = prefix && !badge.startsWith(prefix)
    ? `${prefix.endsWith('-') ? prefix : `${prefix}-`}${badge}`
    : badge

  return {
    id: contract.id,
    token: contract.token,
    title: contract.title,
    status: contract.status,
    content: resolve(contract.content),
    closing: resolve(contract.closing),
    clauses: readContractClauses(contract.clauses).map((clause) => ({
      ...clause,
      title: resolve(clause.title),
      body: resolve(clause.body),
    })),
    fields: readContractFields(contract.fields),
    values: readContractValues(contract.values),
    place: CONTRACT_PLACE,
    documentDate: documentDate.toISOString(),
    sentAt: contract.sentAt,
    signedAt: contract.signedAt,
    signedName: contract.signedName,
    declinedAt: contract.declinedAt,
    declineReason: contract.declineReason,
    officer: {
      firstName: contract.officer.firstName,
      lastName: contract.officer.lastName,
      badgeNumber: badgeLabel,
      rankName: contract.officer.rank?.name ?? null,
      hireDate: contract.officer.hireDate,
    },
  }
}

export type ContractDocument = Awaited<ReturnType<typeof serializeContractDocument>>
