'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PersonFileDetailView } from '@/components/reports/person-files-workspace'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { PageLoader } from '@/components/ui/loading'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'

export default function PersonFileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading } = useAuth()

  if (loading) return <PageLoader />
  if (!hasPermission(user, 'reports:view') && !hasPermission(user, 'internal-affairs:view')) return <UnauthorizedContent />

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-2">
      <Link
        href="/anzeigen?tab=files"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#8ea4bd] transition-colors hover:text-white"
      >
        <ArrowLeft size={14} />
        Alle Personenakten
      </Link>

      <PersonFileDetailView
        personId={id}
        canManage={hasPermission(user, 'reports:manage') || hasPermission(user, 'internal-affairs:manage')}
        canDelete={hasPermission(user, 'reports:delete') || hasPermission(user, 'internal-affairs:manage')}
        onChanged={() => undefined}
        onDeleted={() => router.replace('/anzeigen?tab=files')}
      />
    </div>
  )
}
