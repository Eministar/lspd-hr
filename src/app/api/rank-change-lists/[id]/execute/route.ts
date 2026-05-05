import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { createAuditLog } from '@/lib/audit'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { getBadgePrefix } from '@/lib/settings-helpers'
import { collectUsedBadgeInts, findNextFreeBadgeInRange, formatBadgeNumber, parseBadgeNumberToInt, rankHasBadgeRange } from '@/lib/badge-number'
import { findBadgeNumberConflict, getBlacklistedBadgeRows, releaseTerminatedBadgeNumberConflicts } from '@/lib/badge-blacklist'
import { queueDiscordHrEvent, queueOfficerRoleSync } from '@/lib/discord-integration'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'HR'], ['rank-change-lists:execute'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const entryId = typeof body.entryId === 'string' ? body.entryId : null

    const list = await prisma.rankChangeList.findUnique({
      where: { id },
      include: {
        entries: {
          where: entryId ? { id: entryId, executed: false } : { executed: false },
          include: {
            officer: true,
            currentRank: true,
            proposedRank: true,
            createdBy: { select: { id: true, displayName: true, discordId: true } },
          },
        },
      },
    })

    if (!list) return error('Liste nicht gefunden', 404)
    if (list.entries.length === 0) {
      return error(entryId ? 'Eintrag nicht gefunden oder bereits durchgeführt' : 'Keine offenen Einträge vorhanden')
    }

    const prefix = await getBadgePrefix()
    // Exclude terminated officers so their badge numbers are considered free
    const allRows = await prisma.officer.findMany({ where: { status: { not: 'TERMINATED' } }, select: { badgeNumber: true } })
    const blacklistedBadges = await getBlacklistedBadgeRows()
    const usedBadgeInts = collectUsedBadgeInts(allRows, prefix)
    for (const blacklistedBadge of blacklistedBadges) {
      const n = parseBadgeNumberToInt(blacklistedBadge.badgeNumber, prefix)
      if (n !== null) usedBadgeInts.add(n)
    }
    const requestedBadges = new Map<string, string>()
    for (const entry of list.entries) {
      let nextBadge = entry.newBadgeNumber?.trim() ?? ''
      if (!nextBadge && rankHasBadgeRange(entry.proposedRank)) {
        const current = parseBadgeNumberToInt(entry.officer.badgeNumber, prefix)
        const assigned = findNextFreeBadgeInRange(entry.proposedRank.badgeMin, entry.proposedRank.badgeMax, usedBadgeInts, current)
        // If no free badge is found, fall back to keeping the officer's current badge number
        // (this mirrors the behaviour in the promotions endpoint and avoids a hard 400 when ranges are exhausted)
        if (assigned === null) {
          nextBadge = entry.officer.badgeNumber
        } else {
          nextBadge = formatBadgeNumber(assigned, prefix)
          usedBadgeInts.add(assigned)
        }
      }
      if (!nextBadge || nextBadge === entry.officer.badgeNumber) continue
      const badgeConflict = await findBadgeNumberConflict(nextBadge, prefix, entry.officerId)
      if (badgeConflict) return error(`${badgeConflict}: ${nextBadge}`)
      const duplicateEntry = requestedBadges.get(nextBadge)
      if (duplicateEntry) {
        return error(`Dienstnummer ${nextBadge} ist mehrfach in dieser Liste vorgesehen`)
      }
      requestedBadges.set(nextBadge, entry.officerId)

      const owner = await prisma.officer.findUnique({ where: { badgeNumber: nextBadge }, select: { id: true, status: true } })
      // If owner exists and is not terminated and not the same officer, it's a conflict.
      if (owner && owner.id !== entry.officerId && owner.status !== 'TERMINATED') return error(`Dienstnummer ${nextBadge} ist bereits vergeben`)
      await releaseTerminatedBadgeNumberConflicts(nextBadge, prefix)
      entry.newBadgeNumber = nextBadge
    }

    let executed = 0

    for (const entry of list.entries) {
      if (entry.officer.status === 'TERMINATED') continue

      await prisma.promotionLog.create({
        data: {
          officerId: entry.officerId,
          oldRankId: entry.currentRankId,
          newRankId: entry.proposedRankId,
          oldBadgeNumber: entry.officer.badgeNumber,
          newBadgeNumber: entry.newBadgeNumber || entry.officer.badgeNumber,
          performedByUserId: user.id,
          note: entry.note ? `[${list.name}] ${entry.note}` : `[${list.name}]`,
        },
      })

      await prisma.officer.update({
        where: { id: entry.officerId },
        data: {
          rankId: entry.proposedRankId,
          badgeNumber: entry.newBadgeNumber || entry.officer.badgeNumber,
        },
      })

      await prisma.rankChangeListEntry.update({
        where: { id: entry.id },
        data: { executed: true, executedAt: new Date() },
      })

      const action = list.type === 'DEMOTION' ? 'Degradierung' : 'Beförderung'
      await createAuditLog({
        action: 'OFFICER_PROMOTED',
        userId: user.id,
        officerId: entry.officerId,
        oldValue: entry.currentRank.name,
        newValue: entry.proposedRank.name,
        details: `${action} via "${list.name}": ${entry.officer.firstName} ${entry.officer.lastName} – ${entry.currentRank.name} → ${entry.proposedRank.name}`,
      })

      queueOfficerRoleSync(entry.officerId)
      const submittedBy = entry.createdBy ?? null
      const fields: { name: string; value: string; inline?: boolean }[] = [
        { name: 'Alter Rang', value: entry.currentRank.name, inline: true },
        { name: 'Neuer Rang', value: `**${entry.proposedRank.name}**`, inline: true },
        { name: 'DN-Wechsel', value: `${entry.officer.badgeNumber} → **${entry.newBadgeNumber || entry.officer.badgeNumber}**`, inline: true },
      ]
      if (submittedBy) {
        fields.push({
          name: 'Eingereicht von',
          value: submittedBy.discordId ? `<@${submittedBy.discordId}>` : submittedBy.displayName,
          inline: true,
        })
      }
      queueDiscordHrEvent({
        type: 'promotion',
        title: `${action}: ${entry.officer.firstName} ${entry.officer.lastName}`,
        description: entry.note
          ? `${action} via Liste **${list.name}**.\n*Notiz:* ${entry.note}`
          : `${action} via Liste **${list.name}**.`,
        officer: {
          ...entry.officer,
          badgeNumber: entry.newBadgeNumber || entry.officer.badgeNumber,
          rank: entry.proposedRank,
        },
        actor: user,
        fields,
      })

      executed++
    }

    const remainingEntries = entryId
      ? await prisma.rankChangeListEntry.count({ where: { listId: id, executed: false } })
      : 0

    if (remainingEntries === 0) {
      await prisma.rankChangeList.update({
        where: { id },
        data: { status: 'COMPLETED' },
      })
    }

    return success({ executed, total: list.entries.length })
  } catch (e: unknown) {
    // Log error for debugging (will appear in server console)
    console.error('Error executing rank-change-list:', e)
    if (isUniqueConstraintError(e)) return error('Dienstnummer bereits vergeben')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    // If the error is a plain Bad Request string from Next or middleware, return it as 400
    return error(msg, 400)
  }
}
