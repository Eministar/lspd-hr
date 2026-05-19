import { promises as fs } from 'fs'
import path from 'path'
import Link from 'next/link'
import { AlertCircle, BookOpen, ScrollText } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { renderMarkdown } from '@/lib/markdown'

const quickLinks = [
  { href: '#1-grundpflichten', label: '§1 Grundpflichten' },
  { href: '#2-dienstverhalten', label: '§2 Dienstverhalten' },
  { href: '#3-kommunikation-und-funkdisziplin', label: '§3 Kommunikation' },
  { href: '#4-befehlskette-und-weisungen', label: '§4 Befehlskette' },
  { href: '#5-ausrüstung-und-fahrzeuge', label: '§5 Ausrüstung' },
  { href: '#6-einsatzverhalten', label: '§6 Einsatzverhalten' },
  { href: '#7-dokumentation-und-meldepflichten', label: '§7 Dokumentation' },
  { href: '#8-nebentätigkeiten-und-interessenkonflikte', label: '§8 Interessenkonflikte' },
  { href: '#9-disziplinarmaßnahmen', label: '§9 Disziplinarmaßnahmen' },
  { href: '#10-schlussbestimmungen', label: '§10 Schlussbestimmungen' },
]

async function loadDienstordnung() {
  try {
    const markdownPath = path.join(process.cwd(), 'ordnungen', 'dienstordnung.md')
    const markdown = await fs.readFile(markdownPath, 'utf8')

    return { html: renderMarkdown(markdown), error: null }
  } catch (error) {
    return {
      html: null,
      error: error instanceof Error ? error.message : 'Dienstordnung konnte nicht geladen werden',
    }
  }
}

export default async function DienstordnungPage() {
  const { html, error } = await loadDienstordnung()

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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <article
          className="markdown-document glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/40 p-5 sm:p-7"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/40 p-4">
            <div className="mb-3">
              <p className="text-[13px] font-semibold text-[#edf4fb]">Schnellzugriff</p>
              <p className="mt-1 text-[12px] text-[#8ea4bd]">Direkte Links zu den Abschnitten.</p>
            </div>

            <nav className="space-y-1">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-[8px] px-2.5 py-2 text-[12px] text-[#bfd0e2] transition-colors hover:bg-[#102542]/70 hover:text-[#f0d060]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  )
}
