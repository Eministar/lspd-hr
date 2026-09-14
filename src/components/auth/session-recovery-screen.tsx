'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SessionRecoveryScreenProps {
  message?: string | null
  onRetry: () => Promise<void>
  onClearCache: () => Promise<void>
}

export function SessionRecoveryScreen({ message, onRetry, onClearCache }: SessionRecoveryScreenProps) {
  const router = useRouter()

  return (
    <div className="lspd-login">
      <div className="w-full max-w-[400px] text-center">
        <div className="lspd-login-emblem !mb-6 !h-20 !w-20">
          <Image src="/shield.webp" alt="LSPD" width={80} height={80} priority />
        </div>

        <p className="text-[13px] font-medium text-label-3">Sitzung prüfen</p>
        <h1 className="mt-1 text-[24px] font-bold tracking-[-0.025em] text-label">Keine aktive Sitzung gefunden</h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-[14px] leading-relaxed text-label-2">
          {message || 'Deine Anmeldung ist abgelaufen oder der lokale Browser-Cache enthält alte Sitzungsdaten.'}
        </p>

        <div className="mt-7 grid grid-cols-1 gap-2">
          <Button onClick={onRetry} size="lg">
            <RefreshCw size={15} strokeWidth={2} />
            Neu laden
          </Button>
          <Button variant="secondary" onClick={onClearCache} size="lg">
            <Trash2 size={15} strokeWidth={2} />
            Cache löschen
          </Button>
          <Button variant="ghost" onClick={() => router.push('/login')} size="lg">
            Zum Login
          </Button>
        </div>

        <p className="mt-5 text-[12px] text-label-4">
          Cache löschen entfernt lokale Browserdaten dieser App und meldet dich ab.
        </p>
      </div>
    </div>
  )
}
