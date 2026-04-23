'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/auth-context'
import { Sidebar } from '@/components/layout/sidebar'
import { PageLoader } from '@/components/ui/loading'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  if (loading) return <PageLoader />
  if (!user) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-h-screen">
        <div className="px-8 py-6 max-w-[1360px]">
          {children}
        </div>
      </main>
    </div>
  )
}
