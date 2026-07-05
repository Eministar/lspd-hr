import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { resolveEntryBadgeNumbers } from '@/lib/badge-number'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { getBlacklistedBadgeRows } from '@/lib/badge-blacklist'

export async function GET(req: NextRequest) {
  try {
    await requirePermission('rank-changes:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }

  const type = req.nextUrl.searchParams.get('type') || undefined

  const lists = await prisma.rankChangeList.findMany({
    where: type ? { type } : undefined,
    include: {
      createdBy: { select: { displayName: true } },
      entries: {
        include: {
          officer: { select: { id: true, firstName: true, lastName: true, badgeNumber: true } },
          currentRank: { select: { name: true, color: true } },
          proposedRank: { select: { name: true, color: true, badgeMin: true, badgeMax: true } },
          createdBy: { select: { id: true, displayName: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Auto-DNs (newBadgeNumber = null) werden nicht gespeichert, sondern hier live aus dem
  // aktuellen Stand berechnet, damit sich die Vorschau an DN-Änderungen anpasst.
  if (lists.some((list) => list.entries.some((entry) => !entry.executed && !entry.newBadgeNumber))) {
    const prefix = await getBadgePrefix()
    const allRows = await prisma.officer.findMany({ where: { status: { not: 'TERMINATED' } }, select: { badgeNumber: true } })
    const blacklistedBadges = await getBlacklistedBadgeRows()
    for (const list of lists) {
      const openEntries = list.entries.filter((entry) => !entry.executed)
      if (!openEntries.some((entry) => !entry.newBadgeNumber)) continue
      const resolved = resolveEntryBadgeNumbers(openEntries, allRows, blacklistedBadges, prefix)
      for (const entry of openEntries) {
        if (!entry.newBadgeNumber) entry.newBadgeNumber = resolved.get(entry.id) ?? null
      }
    }
  }

  return success(lists)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['rank-changes:manage'])
    const body = await req.json()

    const { name, description, type } = body
    if (!name?.trim()) return error('Name ist erforderlich')
    if (type && !['PROMOTION', 'DEMOTION'].includes(type)) return error('Ungültiger Typ')

    const list = await prisma.rankChangeList.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        type: type || 'PROMOTION',
        createdById: user.id,
      },
      include: {
        createdBy: { select: { displayName: true } },
        entries: true,
      },
    })

    return success(list, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
