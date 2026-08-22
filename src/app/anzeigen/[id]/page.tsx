import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import {
  CalendarClock,
  FileText,
  Gavel,
  MapPin,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { prisma } from '@/lib/prisma'
import {
  REPORT_STATUS_META,
  isReportStatus,
  personDisplayName,
  sanitizeReportAttachments,
} from '@/lib/reports'
import { formatDateTime } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Anzeige',
  robots: { index: false, follow: false },
}

export default async function PublicReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = await prisma.report.findUnique({
    where: { id },
    select: {
      caseNumber: true,
      charge: true,
      description: true,
      incidentAt: true,
      location: true,
      status: true,
      attachments: true,
      recordedByName: true,
      createdAt: true,
      updatedAt: true,
      complainant: { select: { firstName: true, lastName: true } },
      suspect: { select: { firstName: true, lastName: true } },
      updates: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          note: true,
          authorName: true,
          createdAt: true,
          author: { select: { displayName: true } },
        },
      },
    },
  })

  if (!report || !isReportStatus(report.status)) notFound()

  const statusMeta = REPORT_STATUS_META[report.status]
  const attachments = sanitizeReportAttachments(report.attachments)

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/85 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.18)] sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[11px] border border-[#d4af37]/30 bg-[#0a2040]">
              <Image src="/shield.webp" alt="LSPD" width={38} height={38} priority />
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#d4af37]">Los Santos Police Department</p>
              <h1 className="text-[17px] font-semibold text-white">Anzeige</h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2d634f]/45 bg-[#123026]/70 px-2.5 py-1 text-[11.5px] font-medium text-[#86efac]">
            <ShieldCheck size={13} />
            Freigegebener Nur-Lese-Link
          </span>
        </header>

        <section className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/85 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[6px] border border-[#d4af37]/30 bg-[#d4af37]/10 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold tracking-wide text-[#d4af37]">
              {report.caseNumber}
            </span>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            <span className="text-[11.5px] text-[#6b8299]">Aktualisiert {formatDateTime(report.updatedAt)}</span>
          </div>

          <h2 className="mt-3 whitespace-pre-wrap text-[19px] font-semibold leading-7 text-white">{report.charge}</h2>

          <dl className="mt-4 grid gap-2 sm:grid-cols-3">
            <PublicMeta icon={CalendarClock} label="Tatzeit" value={formatDateTime(report.incidentAt)} />
            <PublicMeta icon={MapPin} label="Tatort" value={report.location || '—'} />
            <PublicMeta icon={UserRound} label="Aufgenommen von" value={report.recordedByName || '—'} />
          </dl>
        </section>

        <section className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/85 p-4 sm:p-5">
          <SectionHeading icon={FileText} title="Sachverhalt" />
          <p className="whitespace-pre-wrap text-[13px] leading-6 text-[#dbe6f3]">{report.description}</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <PublicPerson label="Anzeigenerstatter" name={personDisplayName(report.complainant) || 'Nicht angegeben'} />
          <PublicPerson label="Angezeigter" name={personDisplayName(report.suspect) || 'Nicht angegeben'} />
        </section>

        {attachments.length > 0 && (
          <section className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/85 p-4 sm:p-5">
            <SectionHeading icon={FileText} title={`Beweisbilder (${attachments.length})`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-[10px] border border-[#18385f]/60 bg-[#071a30]/55 transition-colors hover:border-[#d4af37]/35"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={attachment.url} alt={attachment.label} className="h-32 w-full object-cover" />
                  <p className="truncate px-2 py-1.5 text-[11.5px] text-[#8ea4bd]">{attachment.label}</p>
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/85 p-4 sm:p-5">
          <SectionHeading icon={Gavel} title="Verlauf" />
          {report.updates.length > 0 ? (
            <div className="space-y-2">
              {report.updates.map((update) => {
                const updateMeta = update.status && isReportStatus(update.status)
                  ? REPORT_STATUS_META[update.status]
                  : null
                return (
                  <div key={update.id} className="rounded-[10px] border border-[#18385f]/45 bg-[#071a30]/55 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      {updateMeta && <Badge variant={updateMeta.variant}>{updateMeta.shortLabel}</Badge>}
                      <span className="text-[11.5px] text-[#8ea4bd]">{update.author?.displayName || update.authorName || 'System'}</span>
                      <span className="text-[11px] text-[#536b86]">{formatDateTime(update.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[12.5px] leading-5 text-[#dbe6f3]">{update.note}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="py-3 text-[12.5px] text-[#6b8299]">Noch keine Einträge.</p>
          )}
        </section>

        <footer className="pb-3 pt-1 text-center text-[11px] text-[#536b86]">
          Erstellt am {formatDateTime(report.createdAt)} · Dieser Link erlaubt ausschließlich das Lesen der Anzeige.
        </footer>
      </div>
    </main>
  )
}

function PublicMeta({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[#18385f]/45 bg-[#071a30]/55 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#4a6585]">
        <Icon size={12} className="text-[#d4af37]" />
        {label}
      </dt>
      <dd className="mt-1 truncate text-[12.5px] text-[#dbe6f3]">{value}</dd>
    </div>
  )
}

function PublicPerson({ label, name }: { label: string; name: string }) {
  return (
    <div className="rounded-[14px] border border-[#1e3a5c]/45 bg-[#091e36]/85 p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#6b8299]">{label}</p>
      <p className="mt-2 text-[15px] font-semibold text-white">{name}</p>
    </div>
  )
}

function SectionHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon size={15} className="text-[#d4af37]" />
      <h3 className="text-[14px] font-semibold text-white">{title}</h3>
    </div>
  )
}
