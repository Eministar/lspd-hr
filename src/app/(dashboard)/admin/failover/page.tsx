'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, DatabaseZap, PlayCircle, RefreshCw, RotateCcw, SkipForward, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface Ping {
  ok: boolean
  error?: string
}

interface FailedEntry {
  seq: number
  model: string
  operation: string
  error: string | null
  exact: boolean
}

interface SyncStatus {
  startedAt: string
  finishedAt: string
  ok: boolean
  snapshotAt: string | null
  rows: number
  skippedModels: string[]
  error: string | null
}

interface FailoverStatus {
  configured: boolean
  mode: 'primary' | 'standby'
  since: string
  reason: string
  automatic: boolean
  primary: Ping
  standby: Ping
  journal: { open: number; inexact: number; failed: FailedEntry[]; broken: boolean }
  lastSync: SyncStatus | null
}

function dateLabel(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return '—'
  return format(date, 'dd.MM.yyyy HH:mm', { locale: de })
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
  ) : (
    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
  )
}

function DatabaseCard({
  title,
  subtitle,
  ping,
  active,
}: {
  title: string
  subtitle: string
  ping: Ping
  active: boolean
}) {
  return (
    <div
      className={cn(
        'glass-panel-elevated rounded-[12px] p-4 border',
        active ? 'border-gold/40' : 'border-white/5',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'h-9 w-9 rounded-[8px] flex items-center justify-center shrink-0 border',
            active
              ? 'bg-white/[0.06] border-gold/25 text-gold'
              : 'bg-surface border-white/5 text-label-2',
          )}
        >
          <Database className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13.5px] font-semibold text-label truncate">{title}</p>
            {active && (
              <span className="text-[11px] font-semibold text-gold border border-gold/30 rounded-full px-2 py-0.5">
                aktiv
              </span>
            )}
          </div>
          <p className="text-[12px] text-label-2 mt-0.5">{subtitle}</p>
          <div className="flex items-start gap-1.5 mt-2.5">
            <StatusDot ok={ping.ok} />
            <p className={cn('text-[12px] leading-snug', ping.ok ? 'text-emerald-300' : 'text-red-300')}>
              {ping.ok ? 'Erreichbar' : ping.error || 'Nicht erreichbar'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FailoverPage() {
  const { data, loading, refetch } = useFetch<FailoverStatus>('/api/admin/failover')
  const { execute } = useApi()
  const { addToast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  async function act(action: string, payload: Record<string, unknown> = {}, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(action)
    try {
      const result = await execute('/api/admin/failover', {
        method: 'POST',
        body: JSON.stringify({ action, ...payload }),
      })
      const message = (result as { message?: string } | null)?.message
      addToast({ type: 'success', title: message || 'Erledigt' })
      await refetch()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Aktion fehlgeschlagen' })
    } finally {
      setBusy(null)
    }
  }

  if (loading && !data) return <PageLoader />

  if (!data?.configured) {
    return (
      <div>
        <PageHeader
          eyebrow="Administration"
          title="Ausweich-Datenbank"
          description="Zweite Datenbank, die einspringt, wenn die Haupt-Datenbank nicht erreichbar ist."
        />
        <div className="glass-panel-elevated rounded-[12px] p-5 border border-amber-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[13.5px] font-semibold text-label">Noch nicht eingerichtet</p>
              <p className="text-[12.5px] text-label-2 mt-1 leading-relaxed">
                Setze <code className="text-gold">DATABASE_URL_STANDBY</code> in der <code>.env</code> auf die
                zweite Datenbank und starte den Server neu. Danach wird sie stündlich aus den Backup-Dateien
                aktualisiert und springt bei einem Ausfall ein.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const standbyActive = data.mode === 'standby'

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Ausweich-Datenbank"
        description="Die zweite Datenbank wird ausschließlich aus den Backup-Dateien gefüttert — beide Datenbanken sind nie miteinander verbunden."
        action={
          <Button variant="secondary" onClick={() => void refetch()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
            Aktualisieren
          </Button>
        }
      />

      {standbyActive && (
        <div className="rounded-[10px] bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/25 px-4 py-3 mb-5 flex items-start gap-3">
          <DatabaseZap className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-amber-200">Notbetrieb aktiv</p>
            <p className="text-[12px] text-label-2 mt-0.5 leading-relaxed">
              Seit {dateLabel(data.since)} — {data.reason} ({data.automatic ? 'automatisch' : 'von Hand'}). Alle
              Schreibvorgänge werden für das Zurückspielen protokolliert.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 mb-5">
        <DatabaseCard
          title="Haupt-Datenbank"
          subtitle="DATABASE_URL"
          ping={data.primary}
          active={!standbyActive}
        />
        <DatabaseCard
          title="Ausweich-Datenbank"
          subtitle="DATABASE_URL_STANDBY"
          ping={data.standby}
          active={standbyActive}
        />
      </div>

      <div className="glass-panel-elevated rounded-[12px] p-5 mb-5">
        <p className="text-[13.5px] font-semibold text-label mb-1">Umschalten</p>
        <p className="text-[12px] text-label-2 mb-4 leading-relaxed">
          Bei wiederholten Verbindungsfehlern schaltet die App von selbst um. Hier lässt sich dasselbe von Hand
          auslösen — und nur hier geht es wieder zurück.
        </p>
        <div className="flex flex-wrap gap-2">
          {!standbyActive ? (
            <Button
              variant="secondary"
              disabled={busy !== null || !data.standby.ok}
              onClick={() =>
                void act(
                  'switch-to-standby',
                  {},
                  'Auf die Ausweich-Datenbank umschalten? Die App arbeitet danach mit deren Datenstand.',
                )
              }
            >
              <DatabaseZap className="h-3.5 w-3.5 mr-1.5" />
              In den Notbetrieb schalten
            </Button>
          ) : (
            <>
              <Button
                disabled={busy !== null || data.journal.open === 0}
                onClick={() => void act('replay-journal')}
              >
                <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                Journal abspielen ({data.journal.open})
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() =>
                  void act(
                    'switch-to-primary',
                    {},
                    'Zurück auf die Haupt-Datenbank schalten?',
                  )
                }
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Zurückschalten
              </Button>
              {data.journal.open > 0 && (
                <Button
                  variant="danger"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(
                      'switch-to-primary',
                      { force: true },
                      `${data.journal.open} noch nicht übernommene Änderungen gehen dabei unwiderruflich verloren. Wirklich zurückschalten?`,
                    )
                  }
                >
                  Zurückschalten und verwerfen
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {standbyActive && (
        <div className="glass-panel-elevated rounded-[12px] p-5 mb-5">
          <p className="text-[13.5px] font-semibold text-label mb-1">Schreib-Journal</p>
          <p className="text-[12px] text-label-2 mb-4 leading-relaxed">
            {data.journal.open} Änderung(en) warten darauf, in die Haupt-Datenbank übernommen zu werden.
          </p>

          {data.journal.broken && (
            <div className="rounded-[8px] border border-red-500/25 bg-red-500/5 px-3 py-2.5 mb-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-[12px] text-red-200 leading-relaxed">
                Mindestens ein Journal-Eintrag konnte nicht geschrieben werden. Die zugehörige Änderung fehlt beim
                Zurückspielen — im Server-Protokoll steht, welche.
              </p>
            </div>
          )}

          {data.journal.inexact > 0 && (
            <div className="rounded-[8px] border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 mb-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[12px] text-amber-100 leading-relaxed">
                {data.journal.inexact} Eintrag/Einträge bekommen beim Abspielen neue IDs (Massen-Anlagen ohne
                vorgegebene ID). Nach dem Zurückspielen prüfen, ob Verknüpfungen noch stimmen.
              </p>
            </div>
          )}

          {data.journal.failed.length === 0 ? (
            <p className="text-[12px] text-label-2">Keine fehlgeschlagenen Einträge.</p>
          ) : (
            <div className="space-y-2">
              {data.journal.failed.map((entry) => (
                <div
                  key={entry.seq}
                  className="rounded-[8px] border border-red-500/20 bg-red/6 px-3 py-2.5 flex items-start gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-label font-medium">
                      #{entry.seq} · {entry.model}.{entry.operation}
                    </p>
                    <p className="text-[11.5px] text-red-300 mt-0.5 break-words leading-relaxed">{entry.error}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void act(
                        'skip-entry',
                        { seq: entry.seq },
                        `Eintrag #${entry.seq} dauerhaft überspringen? Diese Änderung landet nicht in der Haupt-Datenbank.`,
                      )
                    }
                    className="p-1.5 rounded-[6px] hover:bg-surface-2 transition-colors text-label-2 shrink-0"
                    title="Überspringen"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="glass-panel-elevated rounded-[12px] p-5">
        <div className="flex items-start justify-between gap-4 mb-1">
          <p className="text-[13.5px] font-semibold text-label">Abgleich über die Backup-Dateien</p>
          <Button
            variant="secondary"
            disabled={busy !== null || standbyActive}
            onClick={() => void act('run-sync')}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', busy === 'run-sync' && 'animate-spin')} />
            Jetzt abgleichen
          </Button>
        </div>
        <p className="text-[12px] text-label-2 mb-4 leading-relaxed">
          Stündlich: Snapshot der Haupt-Datenbank schreiben, denselben Snapshot in die Ausweich-Datenbank einspielen.
          Im Notbetrieb pausiert der Abgleich, damit die führende Datenbank nicht überschrieben wird.
        </p>

        {data.lastSync ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-label-2">Zuletzt</p>
              <p className="text-[13px] text-label mt-0.5">{dateLabel(data.lastSync.finishedAt)}</p>
            </div>
            <div>
              <p className="text-[11px] text-label-2">Datenstand</p>
              <p className="text-[13px] text-label mt-0.5">{dateLabel(data.lastSync.snapshotAt)}</p>
            </div>
            <div>
              <p className="text-[11px] text-label-2">Zeilen</p>
              <p className="text-[13px] text-label mt-0.5">{data.lastSync.rows.toLocaleString('de-DE')}</p>
            </div>
            {data.lastSync.error && (
              <p className="sm:col-span-3 text-[12px] text-red-300 leading-relaxed">{data.lastSync.error}</p>
            )}
            {data.lastSync.skippedModels.length > 0 && (
              <p className="sm:col-span-3 text-[12px] text-amber-200 leading-relaxed">
                Nicht eingespielt: {data.lastSync.skippedModels.join(', ')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-label-2">Noch kein Abgleich gelaufen.</p>
        )}
      </div>
    </div>
  )
}
