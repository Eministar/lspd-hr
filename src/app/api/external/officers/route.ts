import { NextRequest } from 'next/server'

import { error, success } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { parseListLimit, parseStatusFilter, toExternalOfficer } from '@/lib/external-api'
import { externalOfficerSelect, noStore, rejectExternalRequest, unitNameMap } from '@/lib/external-api-server'
import type { Prisma } from '@/generated/prisma/client'

export const dynamic = 'force-dynamic'

/**
 * Officer-Suche für das FIB-Dashboard. `q` durchsucht Vorname, Nachname,
 * Dienstnummer und Discord-ID; `status` filtert (kommagetrennt), `limit` ≤ 100.
 */
export async function GET(req: NextRequest) {
  const rejected = rejectExternalRequest(req)
  if (rejected) return noStore(rejected)

  try {
    const params = req.nextUrl.searchParams
    const q = (params.get('q') ?? '').trim().slice(0, 100)
    const statuses = parseStatusFilter(params.get('status'))
    const limit = parseListLimit(params.get('limit'))

    const where: Prisma.OfficerWhereInput = {}
    if (statuses) where.status = { in: statuses }
    if (q) {
      const words = q.split(/\s+/).filter(Boolean).slice(0, 4)
      // Jedes Wort muss in irgendeinem Feld vorkommen: „Max Mus“ findet „Max Mustermann“.
      where.AND = words.map((word) => ({
        OR: [
          { firstName: { contains: word } },
          { lastName: { contains: word } },
          { badgeNumber: { contains: word } },
          { discordId: word },
        ],
      }))
    }

    const [rows, units] = await Promise.all([
      prisma.officer.findMany({
        where,
        select: externalOfficerSelect,
        orderBy: [{ rank: { sortOrder: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
        take: limit,
      }),
      unitNameMap(),
    ])

    return noStore(success(rows.map((row) => toExternalOfficer(row, units))))
  } catch (cause) {
    return noStore(error(cause instanceof Error ? cause.message : 'Serverfehler', 500))
  }
}
