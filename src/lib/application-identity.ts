import { prisma } from '@/lib/prisma'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { setDiscordMemberNickname } from '@/lib/discord-integration'
import {
  buildApplicantDisplayName,
  formatApplicationCaseNumber,
  parseApplicationCaseNumber,
} from '@/lib/application-case-number'

const MAX_CASE_NUMBER_ATTEMPTS = 5

/**
 * Nächste freie laufende Nummer. Bewusst über alle Aktenzeichen statt über
 * `orderBy` ermittelt: die Nummern sind gepolstert ("BW-0001"), ab fünf Stellen
 * würde eine String-Sortierung die höchste Nummer falsch bestimmen.
 */
async function nextCaseNumberValue() {
  const rows = await prisma.jobApplication.findMany({
    where: { caseNumber: { not: null } },
    select: { caseNumber: true },
  })

  const highest = rows.reduce(
    (max, row) => Math.max(max, parseApplicationCaseNumber(row.caseNumber) ?? 0),
    0,
  )
  return highest + 1
}

/**
 * Vergibt das Aktenzeichen. Zwei gleichzeitige Bewerbungen können dieselbe
 * Nummer berechnen — der Unique-Index fängt das ab und der Retry holt die
 * nächste freie.
 */
export async function assignApplicationCaseNumber(applicationId: string) {
  for (let attempt = 1; attempt <= MAX_CASE_NUMBER_ATTEMPTS; attempt += 1) {
    const caseNumber = formatApplicationCaseNumber(await nextCaseNumberValue())
    try {
      await prisma.jobApplication.update({
        where: { id: applicationId },
        data: { caseNumber },
      })
      return caseNumber
    } catch (e: unknown) {
      if (!isUniqueConstraintError(e) || attempt === MAX_CASE_NUMBER_ATTEMPTS) throw e
    }
  }

  throw new Error('Aktenzeichen konnte nicht vergeben werden')
}

/**
 * Vergibt Aktenzeichen und stellt den Bewerber auf „BW-0001 | Vorname Nachname“
 * um — im Dashboard und, sofern der Bot darf, auch als Discord-Nickname.
 * Der Discord-Teil ist Beiwerk: schlägt er fehl, bleibt die Bewerbung gültig.
 */
export async function applyApplicantIdentity(input: {
  applicationId: string
  userId: string
  discordId: string | null
  applicantName: string
}) {
  const caseNumber = await assignApplicationCaseNumber(input.applicationId)
  const displayName = buildApplicantDisplayName(caseNumber, input.applicantName)

  await prisma.$transaction([
    prisma.jobApplication.update({
      where: { id: input.applicationId },
      data: { applicantDisplayName: displayName },
    }),
    prisma.user.update({
      where: { id: input.userId },
      data: { displayName },
    }),
  ])

  const nickname = await setDiscordMemberNickname(input.discordId, displayName).catch((error) => {
    console.error('[Applications] Discord-Nickname konnte nicht gesetzt werden:', error)
    return { status: 'failed' as const }
  })

  return { caseNumber, displayName, nickname: nickname.status }
}
