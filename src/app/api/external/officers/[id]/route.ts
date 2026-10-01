import { NextRequest } from 'next/server'

import { error, notFound, success } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { stripTerminatedBadgeNumber } from '@/lib/badge-number'
import { toExternalOfficer, type ExternalOfficerFile } from '@/lib/external-api'
import { externalOfficerSelect, noStore, rejectExternalRequest, unitNameMap } from '@/lib/external-api-server'

export const dynamic = 'force-dynamic'

/** Beamtenakte: Stammdaten plus Laufbahn (Beförderungen, Sanktionen, Trainings, Kündigungen). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectExternalRequest(req)
  if (rejected) return noStore(rejected)

  try {
    const { id } = await params
    if (!id || id.length > 191) return noStore(notFound('Officer'))

    const [officer, units] = await Promise.all([
      prisma.officer.findUnique({
        where: { id },
        select: {
          ...externalOfficerSelect,
          promotionLogs: {
            orderBy: { createdAt: 'desc' },
            select: {
              createdAt: true,
              oldBadgeNumber: true,
              newBadgeNumber: true,
              note: true,
              oldRank: { select: { name: true } },
              newRank: { select: { name: true } },
            },
          },
          sanctions: {
            orderBy: { createdAt: 'desc' },
            select: {
              createdAt: true,
              reason: true,
              penalGrade: true,
              measureType: true,
              status: true,
              fineAmount: true,
              penalty: true,
            },
          },
          trainings: {
            orderBy: { training: { sortOrder: 'asc' } },
            select: { completed: true, training: { select: { label: true } } },
          },
          terminations: {
            orderBy: { terminatedAt: 'desc' },
            select: { terminatedAt: true, reason: true },
          },
        },
      }),
      unitNameMap(),
    ])
    if (!officer) return noStore(notFound('Officer'))

    const file: ExternalOfficerFile = {
      ...toExternalOfficer(officer, units),
      promotions: officer.promotionLogs.map((log) => ({
        at: log.createdAt.toISOString(),
        fromRank: log.oldRank.name,
        toRank: log.newRank.name,
        fromBadge: log.oldBadgeNumber ? stripTerminatedBadgeNumber(log.oldBadgeNumber) : null,
        toBadge: log.newBadgeNumber ? stripTerminatedBadgeNumber(log.newBadgeNumber) : null,
        note: log.note,
      })),
      sanctions: officer.sanctions.map((sanction) => ({
        at: sanction.createdAt.toISOString(),
        reason: sanction.reason,
        penalGrade: sanction.penalGrade,
        measureType: sanction.measureType,
        status: sanction.status,
        fineAmount: sanction.fineAmount,
        penalty: sanction.penalty,
      })),
      trainings: officer.trainings.map((row) => ({ label: row.training.label, completed: row.completed })),
      terminations: officer.terminations.map((row) => ({ at: row.terminatedAt.toISOString(), reason: row.reason })),
    }

    return noStore(success(file))
  } catch (cause) {
    return noStore(error(cause instanceof Error ? cause.message : 'Serverfehler', 500))
  }
}
