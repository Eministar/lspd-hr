'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { Sidebar } from '@/components/layout/sidebar'
import { AppFooter } from '@/components/layout/app-footer'
import { PageLoader } from '@/components/ui/loading'
import { SessionRecoveryScreen } from '@/components/auth/session-recovery-screen'
import { Button } from '@/components/ui/button'
import { useFetch } from '@/hooks/use-fetch'
import { ChangeHistoryControls } from '@/components/layout/change-history-controls'
import { BackupStatus } from '@/components/layout/backup-status'
import { hasPermission } from '@/lib/permissions'

interface ActiveTestSession {
  sessionId: string
  testId: string
  title: string
  shareToken: string
  startedAt: string
  expiresAt: string | null
}

function NoticeScreen({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <section className="lspd-sheet w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 text-gold">
          <ShieldAlert size={24} strokeWidth={1.75} />
        </div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-label">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-label-2">{text}</p>
        <div className="mt-6 flex justify-center">{children}</div>
      </section>
    </main>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, authError, refreshUser, clearClientCache } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const { data: activeSession, loading: activeSessionLoading } = useFetch<ActiveTestSession | null>(
    !loading && user ? '/api/form-test-sessions/active' : null,
  )
  const visitorOnly = Boolean(user && !user.permissions.some((permission) => permission !== 'password:change'))
  // Ein geteilter Testlink (/form-tests/<token>) ist bewusst KEINE reguläre
  // Dashboard-Seite: Bewerber und frisch eingeladene Officer haben oft noch
  // gar keine Rechte. Vorher landeten genau die im Besucherportal und konnten
  // ihren Test nie öffnen. Die Manage-Ansichten bleiben ausgenommen.
  const isSharedFormTestLink = /^\/form-tests\/(?!manage(?:\/|$))[^/]+\/?$/.test(pathname)

  useEffect(() => {
    if (!loading && !activeSessionLoading && visitorOnly && !isSharedFormTestLink) {
      router.replace('/besucherportal')
    }
  }, [activeSessionLoading, isSharedFormTestLink, loading, router, visitorOnly])

  if (loading) return <PageLoader />
  if (!user) {
    // Wer einen geteilten Testlink öffnet, ohne eingeloggt zu sein, hat keine
    // „kaputte Sitzung“ — er war nie angemeldet. Statt des Recovery-Screens
    // bekommt er den Login mit Rücksprung auf genau diesen Link.
    if (isSharedFormTestLink) {
      return (
        <NoticeScreen
          title="Anmeldung erforderlich"
          text="Melde dich mit Discord an, um diesen Test zu öffnen. Danach landest du automatisch wieder hier."
        >
          <Link href={`/login?redirect=${encodeURIComponent(pathname)}`}>
            <Button size="lg">Zur Anmeldung</Button>
          </Link>
        </NoticeScreen>
      )
    }

    return (
      <SessionRecoveryScreen
        message={authError}
        onRetry={refreshUser}
        onClearCache={clearClientCache}
      />
    )
  }
  if (activeSessionLoading) return <PageLoader />

  // Nutzer ohne Dashboard-Rechte bekommen den Test ohne Seitenleiste — die
  // hätte für sie ohnehin keinen Inhalt.
  if (visitorOnly) {
    if (!isSharedFormTestLink) return <PageLoader />
    return (
      <main className="min-h-screen bg-canvas px-4 pb-10 pt-6 sm:px-6 lg:px-8">{children}</main>
    )
  }

  const activeTestPath = activeSession ? `/form-tests/${activeSession.shareToken}` : ''
  if (activeSession && pathname !== activeTestPath) {
    return (
      <NoticeScreen
        title="Du hast gerade einen Test laufen."
        text="Während der Test aktiv ist, kannst du keine andere Seite im Dashboard öffnen."
      >
        <Link href={activeTestPath}>
          <Button size="lg">Test fortsetzen</Button>
        </Link>
      </NoticeScreen>
    )
  }

  return (
    <div className="lspd-workspace flex min-h-screen">
      <Sidebar />
      <ChangeHistoryControls />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="lspd-content flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-10 lg:pt-10">
          {hasPermission(user, 'settings:manage') && (
            <div className="mb-2 flex justify-end"><BackupStatus /></div>
          )}
          {children}
        </div>
        <AppFooter />
      </main>
    </div>
  )
}
