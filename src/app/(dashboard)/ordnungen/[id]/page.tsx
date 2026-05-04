import { promises as fs } from 'fs'
import path from 'path'
import Link from 'next/link'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { renderMarkdown } from '@/lib/markdown'

interface OrdnungConfig {
  id: string
  title: string
  description: string
  category: string
  buttonLabel: string
  file: string
  icon: string
}

async function loadOrdnung(id: string) {
  try {
    const configPath = path.join(process.cwd(), 'ordnungen', 'config.json')
    const configData = await fs.readFile(configPath, 'utf8')
    const configs: OrdnungConfig[] = JSON.parse(configData)

    const config = configs.find(c => c.id === id)
    if (!config) {
      return { config: null, html: null, error: 'Ordnung nicht gefunden' }
    }

    const markdownPath = path.join(process.cwd(), 'ordnungen', config.file)
    const markdown = await fs.readFile(markdownPath, 'utf8')
    const html = renderMarkdown(markdown)

    return { config, html, error: null }
  } catch (error) {
    return {
      config: null,
      html: null,
      error: error instanceof Error ? error.message : 'Fehler beim Laden der Ordnung',
    }
  }
}

export default async function OrdnungPage({ params }: { params: { id: string } }) {
  const { config, html, error } = await loadOrdnung(params.id)

  if (error || !config || !html) {
    return (
      <div className="max-w-5xl mx-auto pb-4">
        <PageHeader
          title="Fehler"
          description="Die angeforderte Ordnung konnte nicht geladen werden"
          action={
            <Link
              href="/ordnungen"
              className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[8px] bg-[#102542] px-3 text-[12.5px] font-medium text-[#edf4fb] shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-150 hover:bg-[#17375f] active:scale-[0.98]"
            >
              <ArrowLeft size={14} strokeWidth={2} />
              Zurück
            </Link>
          }
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
    <div className="max-w-5xl mx-auto pb-4">
      <PageHeader
        title={config.title}
        description={config.description}
        action={
          <Link
            href="/ordnungen"
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

