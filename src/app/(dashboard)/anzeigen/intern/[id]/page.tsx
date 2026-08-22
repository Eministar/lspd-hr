'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Copy, ExternalLink } from 'lucide-react'
import { ReportDetail } from '@/components/reports/reports-workspace'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { PageLoader } from '@/components/ui/loading'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'

export default function InternalReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading } = useAuth()
  const [copied, setCopied] = useState(false)

  const copyPublicLink = async () => {
    const publicUrl = `${window.location.origin}/anzeigen/${id}`
    try {
      await navigator.clipboard.writeText(publicUrl)
    } catch {
      window.prompt('Öffentlichen Link kopieren:', publicUrl)
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (loading) return <PageLoader />
  if (!hasPermission(user, 'reports:view')) return <UnauthorizedContent />

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/anzeigen?tab=reports"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#8ea4bd] transition-colors hover:text-white"
        >
          <ArrowLeft size={14} />
          Alle Anzeigen
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/anzeigen/${id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#234568] px-3 text-[12px] font-medium text-[#dbe6f3] transition-colors hover:bg-[#102542]/70"
          >
            <ExternalLink size={13} />
            Öffentlichen Link öffnen
          </Link>
          <button
            type="button"
            onClick={() => void copyPublicLink()}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[#d4af37] px-3 text-[12px] font-semibold text-[#071b33] transition-colors hover:bg-[#dcba48]"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Link kopiert' : 'Link kopieren'}
          </button>
        </div>
      </div>

      <ReportDetail
        reportId={id}
        canManage={hasPermission(user, 'reports:manage')}
        canDelete={hasPermission(user, 'reports:delete')}
        onChanged={() => undefined}
        onDeleted={() => router.replace('/anzeigen?tab=reports')}
      />
    </div>
  )
}
