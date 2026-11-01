'use client'

import { AlertTriangle, Crosshair, Download, RefreshCw, ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageLoader } from '@/components/ui/loading'
import { useFetch } from '@/hooks/use-fetch'

interface DesktopRelease {
  version: string
  pubDate: string
  size: number
  notes: string | null
  downloadUrl: string
}

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unbekanntes Datum'
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function DesktopPage() {
  const { data: release, loading, error, refetch } = useFetch<DesktopRelease | null>('/api/desktop')

  if (loading && !release) return <PageLoader />

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Kill-Clips"
        description="Windows-App, die deine Kills im Spiel erkennt und automatisch als kurze Clips schneidet. Sie hält sich selbst aktuell – einmal installieren genügt."
      />

      {!release ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Crosshair size={28} className="text-label-3" aria-hidden />
          <h2 className="text-[15px] font-semibold text-label">
            {error ? 'Release konnte nicht geladen werden' : 'Noch keine Version veröffentlicht'}
          </h2>
          <p className="max-w-md text-[13px] text-label-2">
            {error ?? 'Sobald eine Änderung an der Desktop-App gepusht wurde, erscheint der Installer hier.'}
          </p>
          <Button size="sm" variant="secondary" onClick={() => void refetch()}><RefreshCw size={14} />Erneut prüfen</Button>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-3 text-label">
            <Crosshair size={20} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-label">LSPD Kill-Clips {release.version}</h2>
            <p className="mt-1 text-[12.5px] tabular-nums text-label-2">
              Veröffentlicht {formatDate(release.pubDate)} · {formatSize(release.size)}
            </p>
          </div>
          <a href={release.downloadUrl} download>
            <Button><Download size={15} />Für Windows herunterladen</Button>
          </a>
        </Card>
      )}

      <Card className="flex gap-3.5">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold text-label">Keine 100-%-Erkennung</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-label-2">
            Die App arbeitet mit Bildschirm- und Texterkennung. Je nach Auflösung, HUD und Performance kann sie Kills
            übersehen oder falsch erkennen – so etwas lässt sich nie zu 100&nbsp;% erkennen. Verlasst euch also nicht
            blind darauf, passt trotzdem selbst auf und sichert wichtige Szenen zusätzlich von Hand.
          </p>
        </div>
      </Card>

      <Card className="flex gap-3.5">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-label-2" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold text-label">Windows warnt beim ersten Start</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-label-2">
            Der Installer hat kein Code-Signing-Zertifikat. Windows SmartScreen zeigt deshalb „Der Computer wurde durch
            Windows geschützt“. Die App kommt direkt aus diesem Dashboard.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[12.5px] leading-relaxed text-label-2">
            <li>Im Warnfenster auf <span className="text-label">Weitere Informationen</span> klicken.</li>
            <li>Unten auf <span className="text-label">Trotzdem ausführen</span> klicken.</li>
            <li>Blockiert der Browser schon den Download, dort am Download <span className="text-label">Behalten</span> wählen.</li>
          </ol>
          <p className="mt-2 text-[12.5px] leading-relaxed text-label-2">Nur bei der ersten Installation nötig – Updates installiert die App danach selbst.</p>
        </div>
      </Card>

      <Card>
        <h3 className="text-[13.5px] font-semibold text-label">So funktioniert’s</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-label-2">
          <li>Installer starten – die App installiert sich ohne Administratorrechte für dein Benutzerkonto.</li>
          <li>Unter „Einrichten …“ einmal einen Kill markieren, dann vor dem Spielen „Starten“ drücken.</li>
          <li>Fertige Clips liegen unter <span className="text-label">Videos\LSPD Kill-Clips</span> und sind klein genug für deinen Clips-Channel in Discord.</li>
          <li>Beim Start und alle zehn Minuten prüft die App, ob es hier eine neue Version gibt, und installiert sie selbst.</li>
        </ul>
        <p className="mt-3 text-[12px] text-label-3">Kill-Clip-Erkennung von Emin · ursprünglich entwickelt für FIB Desktop</p>
      </Card>
    </div>
  )
}
