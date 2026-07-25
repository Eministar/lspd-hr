import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { nextSequenceNumber } from '@/lib/sequence-numbers'
import { PERSON_FILE_PREFIX, REPORT_CASE_PREFIX } from '@/lib/reports'

const MAX_NUMBER_ATTEMPTS = 5

/** Kurzform einer Person, wie sie an einer Anzeige hängt. */
export const personSummarySelect = {
  id: true,
  fileNumber: true,
  firstName: true,
  lastName: true,
  phone: true,
  photoUrl: true,
  idCardImageUrl: true,
  wanted: true,
} satisfies Prisma.PersonFileSelect

export const personFileSelect = {
  ...personSummarySelect,
  birthDate: true,
  address: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.PersonFileSelect

export const reportUpdateSelect = {
  id: true,
  status: true,
  note: true,
  authorName: true,
  createdAt: true,
  author: { select: { id: true, displayName: true } },
} satisfies Prisma.ReportUpdateSelect

export const reportSelect = {
  id: true,
  caseNumber: true,
  charge: true,
  description: true,
  incidentAt: true,
  location: true,
  status: true,
  attachments: true,
  recordedByName: true,
  createdAt: true,
  updatedAt: true,
  complainant: { select: personSummarySelect },
  suspect: { select: personSummarySelect },
  recordedBy: { select: { id: true, displayName: true } },
  updates: {
    orderBy: { createdAt: 'desc' as const },
    select: reportUpdateSelect,
  },
} satisfies Prisma.ReportSelect

/** Anzeige in Listen — ohne Verlauf, damit die Übersicht schlank bleibt. */
export const reportListSelect = {
  id: true,
  caseNumber: true,
  charge: true,
  incidentAt: true,
  location: true,
  status: true,
  recordedByName: true,
  createdAt: true,
  updatedAt: true,
  complainant: { select: personSummarySelect },
  suspect: { select: personSummarySelect },
} satisfies Prisma.ReportSelect

export type ReportRecord = Prisma.ReportGetPayload<{ select: typeof reportSelect }>
export type PersonFileRecord = Prisma.PersonFileGetPayload<{ select: typeof personFileSelect }>

async function nextPersonFileNumber() {
  const rows = await prisma.personFile.findMany({ select: { fileNumber: true } })
  return nextSequenceNumber(PERSON_FILE_PREFIX, rows.map((row) => row.fileNumber))
}

async function nextReportCaseNumber() {
  const rows = await prisma.report.findMany({ select: { caseNumber: true } })
  return nextSequenceNumber(REPORT_CASE_PREFIX, rows.map((row) => row.caseNumber))
}

/**
 * Legt eine Akte an und vergibt dabei das Aktenzeichen. Zwei gleichzeitige
 * Anlagen können dieselbe Nummer berechnen — der Unique-Index fängt das ab,
 * der Retry holt die nächste freie.
 */
export async function createPersonFile(data: Omit<Prisma.PersonFileUncheckedCreateInput, 'fileNumber'>) {
  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.personFile.create({
        data: { ...data, fileNumber: await nextPersonFileNumber() },
        select: personFileSelect,
      })
    } catch (e: unknown) {
      if (!isUniqueConstraintError(e) || attempt === MAX_NUMBER_ATTEMPTS) throw e
    }
  }

  throw new Error('Aktenzeichen konnte nicht vergeben werden')
}

export async function createReport(data: Omit<Prisma.ReportUncheckedCreateInput, 'caseNumber'>) {
  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.report.create({
        data: { ...data, caseNumber: await nextReportCaseNumber() },
        select: reportSelect,
      })
    } catch (e: unknown) {
      if (!isUniqueConstraintError(e) || attempt === MAX_NUMBER_ATTEMPTS) throw e
    }
  }

  throw new Error('Aktenzeichen konnte nicht vergeben werden')
}

/**
 * Lädt eine Personenakte samt aller Anzeigen — als Beschuldigter und als
 * Anzeigenerstatter. Genau das ist „die Akte“: alles zu dieser Person an einem
 * Ort.
 */
export async function loadPersonFile(id: string) {
  const person = await prisma.personFile.findUnique({
    where: { id },
    select: personFileSelect,
  })
  if (!person) return null

  const [asSuspect, asComplainant] = await Promise.all([
    prisma.report.findMany({
      where: { suspectId: id },
      orderBy: { createdAt: 'desc' },
      select: reportListSelect,
    }),
    prisma.report.findMany({
      where: { complainantId: id },
      orderBy: { createdAt: 'desc' },
      select: reportListSelect,
    }),
  ])

  return { ...person, reportsAsSuspect: asSuspect, reportsAsComplainant: asComplainant }
}
