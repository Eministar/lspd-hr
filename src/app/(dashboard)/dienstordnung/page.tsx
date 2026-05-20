import { promises as fs } from 'fs'
import path from 'path'
import Link from 'next/link'
import { AlertCircle, BookOpen, ScrollText } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { renderMarkdown } from '@/lib/markdown'

type QuickLink = {
  href: string
  label: string
  section: string
}

function slugifyHeading(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

function cleanHeadingText(value: string) {
  return value
    .replace(/\s+\{#([A-Za-z0-9_-]+)}\s*$/, '')
    .replace(/\s+#+\s*$/, '')
    .trim()
}

function getHeadingId(value: string) {
  return /\s+\{#([A-Za-z0-9_-]+)}\s*$/.exec(value)?.[1] ?? slugifyHeading(cleanHeadingText(value))
}

function getQuickLinks(markdown: string): QuickLink[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => /^##\s+(.+)$/.exec(line.trim())?.[1])
    .filter((heading): heading is string => Boolean(heading))
    .map((heading) => {
      const label = cleanHeadingText(heading)
      const section = /^§\s*(\d+)/.exec(label)?.[1] ?? ''

      return {
        href: `#${getHeadingId(heading)}`,
        label,
        section,
      }
    })
}

async function loadDienstordnung() {
  try {
    const markdownPath = path.join(process.cwd(), 'ordnungen', 'dienstordnung.md')
    const markdown = await fs.readFile(markdownPath, 'utf8')

    return { html: renderMarkdown(markdown), quickLinks: getQuickLinks(markdown), error: null }
  } catch (error) {
    return {
      html: null,
      quickLinks: [],
      error: error instanceof Error ? error.message : 'Dienstordnung konnte nicht geladen werden',
    }
  }
}

export default async function DienstordnungPage() {
  const { html, quickLinks, error } = await loadDienstordnung()

  if (error || !html) {
    return (
      <div className="max-w-5xl mx-auto pb-4">
        <PageHeader
          title="Dienstordnung"
          description="Die Dienstordnung konnte nicht geladen werden."
        />
        <div className="flex items-start gap-3 p-4 rounded-[12px] bg-[#1a2a3a]/40 border border-[#ff6b6b]/30">
          <AlertCircle size={18} className="text-[#ff6b6b] shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-[#ff6b6b]">Fehler beim Laden</p>
            <p className="text-[12px] text-[#888] mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto pb-4">
      <PageHeader
        title="Dienstordnung"
        description="Allgemeine Dienstordnung des Las Santos Police Department"
        action={
          <div className="flex flex-wrap gap-1.5">
            <Link
              href="/ordnungen"
              className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[8px] border border-[#234568] px-3 text-[12.5px] font-medium text-[#edf4fb] shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-all duration-150 hover:bg-[#102542]/50 active:scale-[0.98]"
            >
              <BookOpen size={14} strokeWidth={2} />
              Ordnungen
            </Link>
            <Link
              href="/ordnungen/sanktionskatalog"
              className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[8px] border border-[#234568] px-3 text-[12.5px] font-medium text-[#edf4fb] shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-all duration-150 hover:bg-[#102542]/50 active:scale-[0.98]"
            >
              <ScrollText size={14} strokeWidth={2} />
              Sanktionskatalog
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <article
          className="markdown-document glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/40 p-5 sm:p-7"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/40 p-4">
            <div className="mb-3 border-b border-[#1e3a5c]/50 pb-3">
              <p className="text-[13px] font-semibold text-[#edf4fb]">Schnellzugriff</p>
              <p className="mt-1 text-[12px] text-[#8ea4bd]">
                {quickLinks.length} Abschnitte aus der Dienstordnung
              </p>
            </div>

            <nav className="max-h-[calc(100vh-190px)] space-y-1 overflow-y-auto pr-1">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex min-h-[34px] items-start gap-2 rounded-[8px] px-2.5 py-2 text-[12px] text-[#bfd0e2] transition-colors hover:bg-[#102542]/70 hover:text-[#f0d060]"
                >
                  <span className="mt-[1px] flex h-[18px] min-w-[30px] items-center justify-center rounded-[6px] border border-[#234568]/75 bg-[#071426]/55 text-[10.5px] font-semibold text-[#8ea4bd] transition-colors group-hover:border-[#d4af37]/35 group-hover:text-[#f0d060]">
                    {link.section ? `§${link.section}` : 'Info'}
                  </span>
                  <span className="min-w-0 leading-[1.35]">{link.label.replace(/^§\s*\d+\s*/, '')}</span>
                </Link>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  )
}
