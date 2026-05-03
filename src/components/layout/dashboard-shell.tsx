'use client'

import { useAuth } from '@/context/auth-context'
import { Sidebar } from '@/components/layout/sidebar'
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
      <main className="flex-1 min-h-screen min-w-0">
        <div className="px-3 sm:px-6 lg:px-8 pt-16 lg:pt-6 pb-6 max-w-[1360px]">
          {children}
        </div>
      </main>
    </div>
  )
}
