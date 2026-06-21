'use client'

import { useAuth } from '@/context/auth-context'
import { Sidebar } from '@/components/layout/sidebar'
import { AppFooter } from '@/components/layout/app-footer'
import { PageLoader } from '@/components/ui/loading'
import { SessionRecoveryScreen } from '@/components/auth/session-recovery-screen'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, authError, refreshUser, clearClientCache } = useAuth()

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
