'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { StatusPageFrame, StatusLink } from '@/components/layout/status-page-frame'
import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <StatusPageFrame
      icon={AlertTriangle}
      kicker="Etwas ist schiefgelaufen"
      title="Fehler beim Laden"
      description={
        process.env.NODE_ENV === 'development' && error?.message
          ? error.message
          : 'Die Anwendung konnte diesen Inhalt nicht laden. Bitte versuche es erneut.'
      }
    >
      <div className="mt-6 flex flex-col gap-2.5">
        <Button type="button" onClick={reset} className="h-[38px] w-full">
          Erneut versuchen
        </Button>
        <StatusLink href="/" variant="secondary">Zum Dashboard</StatusLink>
      </div>
    </StatusPageFrame>
  )
}
