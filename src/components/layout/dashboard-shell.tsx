'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { Sidebar } from '@/components/layout/sidebar'
import { AppFooter } from '@/components/layout/app-footer'
import { PageLoader } from '@/components/ui/loading'
import { SessionRecoveryScreen } from '@/components/auth/session-recovery-screen'
import { Button } from '@/components/ui/button'
import { useFetch } from '@/hooks/use-fetch'

interface ActiveTestSession {
  sessionId: string
  testId: string
  title: string
  shareToken: string
  startedAt: string
  expiresAt: string | null
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, authError, refreshUser, clearClientCache } = useAuth()
  const pathname = usePathname()
  const { data: activeSession, loading: activeSessionLoading } = useFetch<ActiveTestSession | null>(
    !loading && user ? '/api/form-test-sessions/active' : null,
  )

  if (loading) return <PageLoader />
  if (!user) {
    return (
      <SessionRecoveryScreen
        message={authError}
        onRetry={refreshUser}
        onClearCache={clearClientCache}
      />
    )
  }
  if (activeSessionLoading) return <PageLoader />

  const activeTestPath = activeSession ? `/form-tests/${activeSession.shareToken}` : ''
  if (activeSession && pathname !== activeTestPath) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#061426] px-4 py-10">
        <section className="glass-panel-elevated w-full max-w-xl rounded-[14px] border border-[#1e3a5c]/45 p-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[14px] border border-[#d4af37]/30 bg-[#d4af37]/12 text-[#d4af37]">
            <ShieldAlert size={28} />
          </div>
          <h1 className="text-[20px] font-semibold text-white">Du hast gerade einen Test laufen.</h1>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-5 text-[#8ea4bd]">
            Während der Test aktiv ist, kannst du keine andere Seite im Dashboard öffnen.
          </p>
          <div className="mt-5 flex justify-center">
            <Link href={activeTestPath}>
              <Button>
                Test fortsetzen
              </Button>
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#061426]">
      <Sidebar />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="w-full flex-1 px-3 pb-10 pt-16 sm:px-6 lg:px-8 lg:pt-6">
          {children}
        </div>
        <AppFooter />
      </main>
    </div>
  )
}
