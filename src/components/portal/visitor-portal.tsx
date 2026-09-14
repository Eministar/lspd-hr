'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { BadgeCheck, Briefcase, Building2, ChevronRight, FileText, LogOut, Megaphone, Search, ShieldCheck, UserRound, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageLoader } from '@/components/ui/loading'
import { fieldClass } from '@/components/ui/input'
import { useAuth } from '@/context/auth-context'
import { useFetch } from '@/hooks/use-fetch'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'
import { JOB_APPLICATION_STATUS_META, type JobApplicationStatusValue } from '@/lib/job-applications'
import { renderMarkdown } from '@/lib/markdown'
import {
  PRESS_RELEASE_STATUS_META,
  pressReleaseExcerpt,
  type PressReleaseStatusValue,
} from '@/lib/press-releases'

interface PublicOfficer {
  badgeNumber: string
  firstName: string
  lastName: string
  hireDate: string
  unit: string | null
  units: string[] | null
  unitInfo: { key: string; name: string; color: string }[]
  rank: { name: string; color: string; sortOrder: number }
}

interface PublicPressRelease {
  id: string
  title: string
  slug: string
  summary: string | null
  content: string
  imageUrl: string | null
  imageAlt: string | null
  status: PressReleaseStatusValue
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  createdBy: { id: string; displayName: string } | null
}

interface PortalApplication {
  id: string
  caseNumber: string | null
  status: JobApplicationStatusValue
  statusText: string
  submittedAt: string
  updatedAt: string
}

interface ApplicationPortalPayload {
  application: PortalApplication | null
}

const OFFICER_GRID = 'lg:grid-cols-[88px_minmax(0,1.2fr)_minmax(150px,0.9fr)_minmax(160px,1fr)_120px]'

function startApplicationLogin() {
  window.location.href = '/api/auth/discord/login?mode=application&remember=1'
}

export function VisitorPortal() {
  const { user, loading: authLoading, refreshUser } = useAuth()
  const { data: pressReleases, loading: pressLoading } = useFetch<PublicPressRelease[]>('/api/press-releases')
  const { data: officers, loading: officersLoading } = useFetch<PublicOfficer[]>('/api/public/officers')
  const { data: applicationPayload, loading: applicationLoading } = useFetch<ApplicationPortalPayload>(
    !authLoading && user ? '/api/applications/me' : null,
  )
  const [officerSearch, setOfficerSearch] = useState('')
  const [selectedPressId, setSelectedPressId] = useState<string | null>(null)

  const releases = pressReleases ?? []
  const selectedPress = selectedPressId
    ? releases.find((release) => release.id === selectedPressId) ?? null
    : releases[0] ?? null
  const selectedPressHtml = useMemo(
    () => (selectedPress ? renderMarkdown(selectedPress.content) : ''),
    [selectedPress],
  )
  const application = applicationPayload?.application ?? null

  const filteredOfficers = useMemo(() => {
    const query = officerSearch.trim().toLowerCase()
    const rows = officers ?? []
    if (!query) return rows
    return rows.filter((officer) => (
      officer.firstName.toLowerCase().includes(query) ||
      officer.lastName.toLowerCase().includes(query) ||
      officer.badgeNumber.toLowerCase().includes(query) ||
      officer.rank.name.toLowerCase().includes(query) ||
      officer.unitInfo.some((unit) => unit.name.toLowerCase().includes(query))
    ))
  }, [officerSearch, officers])

  const logout = async () => {
    await fetch('/api/auth/login', { method: 'DELETE' }).catch(() => undefined)
    await refreshUser().catch(() => undefined)
  }

  if (authLoading) return <PageLoader />

  return (
    <main className="lspd-public min-h-screen text-label">
      <header className="lspd-toolbar sticky top-0 z-40">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/besucherportal" className="flex min-w-0 items-center gap-2.5">
            <Image src="/shield.webp" alt="LSPD" width={28} height={28} priority />
            <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-label">LSPD Besucherportal</span>
          </Link>

          <nav className="flex items-center gap-0.5 overflow-x-auto" aria-label="Portal">
            <a href="#bewerbung" className="portal-nav-link hidden sm:inline-flex">Bewerbung</a>
            <a href="#presse" className="portal-nav-link hidden sm:inline-flex">Presse</a>
            <a href="#mitarbeiter" className="portal-nav-link hidden sm:inline-flex">Mitarbeiter</a>
            {user ? (
              <>
                {user.permissions.some((permission) => permission !== 'password:change') && (
                  <Link href="/" className="portal-nav-link">Dashboard</Link>
                )}
                <button type="button" onClick={logout} className="portal-nav-link">
                  <LogOut size={14} strokeWidth={1.75} />
                  Abmelden
                </button>
              </>
            ) : (
              <Link href="/login" className="portal-nav-link">Dashboard-Login</Link>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-16 sm:px-6 lg:px-8">
        <section id="bewerbung" className="scroll-mt-section grid grid-cols-1 gap-10 py-14 lg:grid-cols-[1fr_360px] lg:items-center lg:py-24">
          <div className="lspd-portal-intro">
            <p className="mb-4 text-[15px] font-medium text-gold-bright">Öffentlicher Bereich</p>
            <h1 className="text-label">Dein Zugang zum LSPD.</h1>
            <p className="mt-5">
              Bewirb dich für den Polizeidienst, entdecke Neuigkeiten aus dem Department und lerne unser Team kennen.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link href="/bewerbung">
                <Button size="lg" className="h-11 px-6 text-[15px]">
                  <Briefcase size={17} strokeWidth={1.9} />
                  Bewerbung öffnen
                </Button>
              </Link>
            </div>
          </div>

          <aside className="lspd-card rounded-[16px] p-6">
            {user ? (
              <div>
                <div className="flex items-center gap-3">
                  {user.avatarUrl ? (
                    <span
                      className="h-12 w-12 shrink-0 rounded-full bg-cover bg-center ring-1 ring-white/10"
                      style={{ backgroundImage: `url(${user.avatarUrl})` }}
                      aria-label={user.displayName}
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-4 text-[16px] font-semibold text-label">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-label">{user.displayName}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-label-3">
                      {user.discordId ? `Discord-ID ${user.discordId}` : user.username}
                    </p>
                  </div>
                </div>
                <div className="mt-5 rounded-[12px] bg-white/[0.04] p-4">
                  {applicationLoading ? (
                    <p className="text-[13px] text-label-2">Bewerbungsstatus wird geladen...</p>
                  ) : application ? (
                    <ApplicationStatus application={application} />
                  ) : (
                    <div className="flex items-start gap-2.5">
                      <UserRound size={16} className="mt-0.5 shrink-0 text-label-3" strokeWidth={1.75} />
                      <p className="text-[13px] leading-relaxed text-label-2">
                        Für dieses Discord-Konto liegt noch keine Bewerbung vor.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-indigo/20 text-indigo">
                  <ShieldCheck size={21} strokeWidth={1.9} />
                </div>
                <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-label">Bewerbung mit Discord</h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-label-2">
                  Melde dich mit deinem Discord-Konto an, um eine Bewerbung einzureichen oder den Status zu sehen.
                </p>
                <Button type="button" size="lg" className="mt-5 w-full" onClick={startApplicationLogin}>
                  Discord anmelden
                </Button>
              </div>
            )}
          </aside>
        </section>

        <section id="presse" className="scroll-mt-section border-t border-line pt-12">
          <PortalSectionHeader
            icon={Megaphone}
            title="Pressemitteilungen"
            description="Öffentlich freigegebene Meldungen des Departments."
            detail={`${releases.length} veröffentlicht`}
          />

          {pressLoading ? (
            <PageLoader />
          ) : releases.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_1fr]">
              <div className="space-y-1">
                {releases.map((release) => {
                  const active = selectedPress?.id === release.id
                  return (
                    <button
                      key={release.id}
                      type="button"
                      onClick={() => setSelectedPressId(release.id)}
                      aria-pressed={active}
                      className={cn(
                        'block w-full rounded-[12px] px-4 py-3 text-left transition-colors duration-150',
                        active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]',
                      )}
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-3">
                        <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-label">{release.title}</p>
                        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', PRESS_RELEASE_STATUS_META[release.status].tone)}>
                          {PRESS_RELEASE_STATUS_META[release.status].label}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-label-2">{release.summary || pressReleaseExcerpt(release.content)}</p>
                      <p className="mt-1.5 text-[12px] tabular-nums text-label-3">{formatDateTime(release.publishedAt ?? release.createdAt)}</p>
                    </button>
                  )
                })}
              </div>

              {selectedPress && (
                <article className="lspd-card overflow-hidden rounded-[16px]">
                  <div
                    className="aspect-[16/7] min-h-[220px] bg-surface-2 bg-cover bg-center"
                    style={selectedPress.imageUrl ? { backgroundImage: `url(${selectedPress.imageUrl})` } : undefined}
                    aria-label={selectedPress.imageAlt ?? selectedPress.title}
                  >
                    {!selectedPress.imageUrl && (
                      <div className="flex h-full items-center justify-center text-label-4">
                        <FileText size={36} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                  <div className="p-6 sm:p-8">
                    <p className="mb-2 text-[13px] font-medium tabular-nums text-label-3">
                      {formatDateTime(selectedPress.publishedAt ?? selectedPress.createdAt)}
                    </p>
                    <h3 className="max-w-3xl text-[28px] font-bold leading-tight tracking-[-0.03em] text-label">{selectedPress.title}</h3>
                    {selectedPress.summary && <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-label-2">{selectedPress.summary}</p>}
                    <div
                      className="markdown-document mt-6 max-w-[72ch] text-[14.5px] leading-7 text-label"
                      dangerouslySetInnerHTML={{ __html: selectedPressHtml }}
                    />
                  </div>
                </article>
              )}
            </div>
          ) : (
            <EmptyPanel icon={Megaphone} text="Keine veröffentlichten Pressemitteilungen vorhanden" />
          )}
        </section>

        <section id="mitarbeiter" className="scroll-mt-section mt-16 border-t border-line pt-12">
          <PortalSectionHeader
            icon={Building2}
            title="Mitarbeiterliste"
            description="Öffentliche Übersicht mit Rang, Unit und Einstellungsdatum."
            detail={`${filteredOfficers.length} Mitarbeiter`}
          />

          <div className="lspd-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:w-[320px]">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-3" strokeWidth={2} />
                <input
                  type="search"
                  aria-label="Mitarbeiter durchsuchen"
                  value={officerSearch}
                  onChange={(event) => setOfficerSearch(event.target.value)}
                  placeholder="Name, DN, Rang oder Unit..."
                  className={cn(fieldClass, 'h-[34px] pl-8 pr-3')}
                />
              </div>
              <Link href="/public/officers" className="inline-flex items-center gap-0.5 text-[13.5px] font-medium text-gold-bright transition-colors hover:text-gold-bright">
                Einzelansicht öffnen
                <ChevronRight size={15} strokeWidth={2} />
              </Link>
            </div>

            {officersLoading ? (
              <PageLoader />
            ) : filteredOfficers.length > 0 ? (
              <div className="max-h-[620px] overflow-y-auto">
                <div className={cn('sticky top-0 z-[1] hidden gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-[12px] font-medium text-label-3 lg:grid', OFFICER_GRID)}>
                  <span>DN</span>
                  <span>Name</span>
                  <span>Rang</span>
                  <span>Unit</span>
                  <span>Einstellung</span>
                </div>
                {filteredOfficers.map((officer) => (
                  <div
                    key={`${officer.badgeNumber}-${officer.firstName}-${officer.lastName}`}
                    className={cn('grid grid-cols-1 gap-1.5 border-b border-line px-5 py-3 transition-colors last:border-b-0 hover:bg-white/[0.025] lg:items-center lg:gap-4', OFFICER_GRID)}
                  >
                    <span className="font-mono text-[12.5px] tabular-nums text-label-3">{displayBadgeNumber(officer.badgeNumber)}</span>
                    <p className="min-w-0 truncate text-[14px] font-medium text-label">{officer.firstName} {officer.lastName}</p>
                    <p className="flex min-w-0 items-center gap-2 text-[13px] text-label-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: officer.rank.color }} aria-hidden />
                      <span className="truncate">{officer.rank.name}</span>
                    </p>
                    <span className="flex min-w-0 flex-wrap gap-1">
                      {officer.unitInfo.map((unit) => (
                        <span
                          key={unit.key}
                          className="inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-medium"
                          style={{ color: unit.color, backgroundColor: `color-mix(in srgb, ${unit.color} 16%, transparent)` }}
                        >
                          {unit.name}
                        </span>
                      ))}
                      {officer.unitInfo.length === 0 && <span className="text-[12.5px] text-label-4">Keine Unit</span>}
                    </span>
                    <span className="text-[12.5px] tabular-nums text-label-2">{formatDate(officer.hireDate)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={Users} text="Keine Officers gefunden" />
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function ApplicationStatus({ application }: { application: PortalApplication }) {
  const meta = JOB_APPLICATION_STATUS_META[application.status]
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <BadgeCheck size={16} className="text-green" strokeWidth={1.9} />
        <Badge variant={meta.variant}>{meta.label}</Badge>
        {application.caseNumber && (
          <span className="inline-flex h-5 items-center rounded-full bg-white/[0.07] px-2 font-mono text-[11.5px] font-medium text-label-2">
            {application.caseNumber}
          </span>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-label">{application.statusText}</p>
      <p className="mt-2 text-[12px] tabular-nums text-label-3">Aktualisiert {formatDateTime(application.updatedAt)}</p>
    </div>
  )
}

function PortalSectionHeader({
  icon: Icon,
  title,
  description,
  detail,
}: {
  icon: LucideIcon
  title: string
  description: string
  detail: string
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="flex items-center gap-2.5 text-[26px] font-bold tracking-[-0.03em] text-label">
          <Icon size={22} className="text-label-3" strokeWidth={1.75} />
          {title}
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-label-3">{description}</p>
      </div>
      <span className="text-[13px] font-medium tabular-nums text-label-3">{detail}</span>
    </div>
  )
}

function EmptyPanel({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <Icon size={26} className="mb-3 text-label-4" strokeWidth={1.5} />
      <p className="text-[13.5px] text-label-3">{text}</p>
    </div>
  )
}
