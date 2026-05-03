import { promises as fs } from 'fs'
import path from 'path'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { renderMarkdown } from '@/lib/markdown'

export default async function SanktionskatalogPage() {
  const filePath = path.join(process.cwd(), 'sanktionskatalog.md')
  const markdown = await fs.readFile(filePath, 'utf8')
  const html = renderMarkdown(markdown)

  return (
    <div className="max-w-5xl mx-auto pb-2">
      <PageHeader
        title="Sanktionskatalog"
        description="Interner Sanktionskatalog der HR Abteilung."
        action={
          <Link
            href="/hr"
            className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[8px] bg-[#102542] px-3 text-[12.5px] font-medium text-[#edf4fb] shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-150 hover:bg-[#17375f] active:scale-[0.98]"
          >
            <ArrowLeft size={14} strokeWidth={2} />
            Zurück
          </Link>
        }
      />

      <article
        className="markdown-document glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/40 p-5 sm:p-7"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
