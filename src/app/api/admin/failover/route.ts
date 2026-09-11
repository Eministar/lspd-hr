import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import {
  activeMode,
  getState,
  isFailoverConfigured,
  isJournalBroken,
  journalQuery,
  openJournalCount,
  pingDatabase,
  replayJournal,
  switchTo,
} from '@/lib/db-failover'
import { readStandbySyncStatus, runStandbySync } from '@/lib/standby-sync-job'

export const dynamic = 'force-dynamic'

/**
 * Steuerung des Notbetriebs.
 *
 * Alles hier muss auch dann funktionieren, wenn die Haupt-Datenbank nicht
 * erreichbar ist — die Anmeldung läuft in dem Fall über die Standby-Datenbank,
 * der Umschaltzustand liegt ohnehin in einer Datei.
 */

async function guard() {
  await requireAuth(['ADMIN'], ['settings:manage'])
}

function handleError(e: unknown) {
  const msg = e instanceof Error ? e.message : 'Serverfehler'
  if (msg === 'Unauthorized') return unauthorized()
  if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
  return error(msg, 500)
}

async function buildStatus() {
  const configured = isFailoverConfigured()
  const state = getState()

  const [primary, standby] = await Promise.all([
    pingDatabase('primary'),
    configured ? pingDatabase('standby') : Promise.resolve({ ok: false, error: 'Nicht eingerichtet.' }),
  ])

  let openEntries = 0
  let failedEntries: { seq: number; model: string; operation: string; error: string | null; exact: boolean }[] = []
  let inexactEntries = 0

  if (configured && standby.ok) {
    openEntries = await openJournalCount()
    const journal = journalQuery()
    const failed = await journal.findMany({
      where: { appliedAt: null, skipped: false, NOT: { error: null } },
      orderBy: { seq: 'asc' },
      take: 100,
    })
    failedEntries = failed.map((entry) => ({
      seq: entry.seq,
      model: entry.model,
      operation: entry.operation,
      error: entry.error,
      exact: entry.exact,
    }))
    inexactEntries = await journal.count({ where: { appliedAt: null, skipped: false, exact: false } })
  }

  return {
    configured,
    mode: activeMode(),
    since: state.since,
    reason: state.reason,
    automatic: state.automatic,
    primary,
    standby,
    journal: { open: openEntries, inexact: inexactEntries, failed: failedEntries, broken: isJournalBroken() },
    lastSync: readStandbySyncStatus(),
  }
}

export async function GET() {
  try {
    await guard()
  } catch (e) {
    return handleError(e)
  }

  try {
    return success(await buildStatus())
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    await guard()
  } catch (e) {
    return handleError(e)
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; seq?: number; force?: boolean }

    if (!isFailoverConfigured()) {
      return error('Notbetrieb ist nicht eingerichtet — DATABASE_URL_STANDBY fehlt.', 400)
    }

    switch (body.action) {
      case 'switch-to-standby': {
        if (activeMode() === 'standby') return error('Der Notbetrieb ist bereits aktiv.', 400)
        const ping = await pingDatabase('standby')
        if (!ping.ok) return error(`Standby-Datenbank nicht erreichbar: ${ping.error}`, 503)
        switchTo('standby', 'Von Hand in den Notbetrieb geschaltet.', false)
        return success({ message: 'Notbetrieb aktiv. Schreibvorgänge werden für das Zurückspielen protokolliert.' })
      }

      case 'replay-journal': {
        const primary = await pingDatabase('primary')
        if (!primary.ok) return error(`Haupt-Datenbank nicht erreichbar: ${primary.error}`, 503)
        const result = await replayJournal()
        return success({
          ...result,
          message:
            result.failed === 0
              ? `${result.applied} Einträge in die Haupt-Datenbank übernommen.`
              : `${result.applied} übernommen, ${result.failed} fehlgeschlagen.`,
        })
      }

      case 'skip-entry': {
        if (typeof body.seq !== 'number') return error('seq fehlt.', 400)
        await journalQuery().update({ where: { seq: body.seq }, data: { skipped: true } })
        return success({ message: `Eintrag ${body.seq} wird nicht mehr abgespielt.` })
      }

      case 'switch-to-primary': {
        const primary = await pingDatabase('primary')
        if (!primary.ok) return error(`Haupt-Datenbank nicht erreichbar: ${primary.error}`, 503)

        const open = await openJournalCount()
        if (open > 0 && !body.force) {
          return error(
            `${open} Journal-Einträge sind noch nicht übernommen. Erst abspielen — oder das Zurückschalten ausdrücklich erzwingen (die Änderungen gehen dann verloren).`,
            409,
          )
        }

        switchTo('primary', open > 0 ? `Erzwungen, ${open} Einträge verworfen.` : 'Zurück im Normalbetrieb.', false)
        // Abgeräumtes Journal: der nächste Ausfall soll mit einer leeren Liste
        // beginnen, sonst wären alte und neue Einträge nicht zu unterscheiden.
        await journalQuery().deleteMany({}).catch(() => {})
        return success({ message: 'Zurück auf der Haupt-Datenbank.' })
      }

      case 'run-sync': {
        const outcome = await runStandbySync()
        if (!outcome.ran) return error(outcome.reason, 409)
        return success(outcome.status)
      }

      default:
        return error('Unbekannte Aktion.', 400)
    }
  } catch (e) {
    return handleError(e)
  }
}
