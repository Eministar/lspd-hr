'use client'

import { useEffect } from 'react'
import './globals.css'
import { ServerCrash } from 'lucide-react'
import { StatusPageFrame, StatusLink } from '@/components/layout/status-page-frame'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    fetch('/api/runtime-events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Schwerer App-Fehler',
        message: error?.message,
        digest: error?.digest,
        path: window.location.pathname,
        stack: error?.stack,
      }),
      keepalive: true,
    }).catch(() => {})
  }, [error])

  return (
    <html lang="de" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <title>Schwerer Fehler | LSPD HR</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-[#061426] text-[#edf4fb] font-sans" suppressHydrationWarning>
        <StatusPageFrame
          icon={ServerCrash}
          kicker="Anwendung"
          code="500"
          title="Schwerer Fehler"
          description="Die Anwendung konnte nicht korrekt geladen werden. Bitte lade die Seite neu oder versuche es später erneut."
        >
          <div className="mt-6 flex flex-col gap-2.5">
            <Button type="button" onClick={reset} className="h-[38px] w-full">
              Erneut versuchen
            </Button>
            <StatusLink href="/" variant="secondary">Zum Dashboard</StatusLink>
          </div>
        </StatusPageFrame>
      </body>
    </html>
  )
}
