'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, Briefcase, Building2, FileText, LogOut, Megaphone, Search, ShieldCheck, UserRound, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageLoader } from '@/components/ui/loading'
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
  status: JobApplicationStatusValue
  statusText: string
  submittedAt: string
  updatedAt: string
}

interface ApplicationPortalPayload {
  application: PortalApplication | null
}

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
    <main className="min-h-screen bg-[#061426] bg-pattern text-[#edf4fb]">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-[#18385f]/55 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/besucherportal" className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[13px] border border-[#d4af37]/25 bg-[#0a2040]">
              <Image src="/shield.webp" alt="LSPD" width={40} height={40} priority className="rounded-full" />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight text-white">LSPD Besucherportal</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d4af37]/75">
                Bewerbungen · Presse · Mitarbeiter
              </p>
            </div>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <a href="#bewerbung" className="portal-nav-link">Bewerbung</a>
            <a href="#presse" className="portal-nav-link">Presse</a>
            <a href="#mitarbeiter" className="portal-nav-link">Mitarbeiter</a>
            {user ? (
              <>
                {user.permissions.some((permission) => permission !== 'password:change') && (
                  <Link href="/" className="portal-nav-link">Dashboard</Link>
                )}
                <button type="button" onClick={logout} className="portal-nav-link">
                  <LogOut size={13} />
                  Abmelden
                </button>
              </>
            ) : (
              <Link href="/login" className="portal-nav-link">Dashboard-Login</Link>
            )}
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px] lg:items-stretch">
          <div className="rounded-[18px] border border-[#1e3a5c]/55 bg-[#091e36]/74 p-5 shadow-[0_10px_34px_rgba(0,0,0,0.22)] sm:p-7">
            <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#d4af37]/80">Öffentlicher Bereich</p>
            <h1 className="max-w-3xl text-[28px] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-[36px]">
              Informationen für Besucher und Bewerber.
            </h1>
            <p className="mt-4 max-w-2xl text-[13.5px] leading-6 text-[#9fb0c4]">
              Hier findest du Bewerbungen, veröffentlichte Pressemitteilungen und die sichtbare Mitarbeiterliste. Interne HR- und Polizeiinhalte bleiben im Dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/bewerbung">
                <Button size="lg">
                  <Briefcase size={16} />
                  Bewerbung öffnen
                </Button>
              </Link>
              <a href="#presse">
                <Button size="lg" variant="secondary">
                  <Megaphone size={16} />
                  Pressemitteilungen
                </Button>
              </a>
              <a href="#mitarbeiter">
                <Button size="lg" variant="secondary">
                  <Users size={16} />
                  Mitarbeiterliste
                </Button>
              </a>
            </div>
          </div>

          <aside className="rounded-[18px] border border-[#1e3a5c]/55 bg-[#091e36]/74 p-5 shadow-[0_10px_34px_rgba(0,0,0,0.22)]">
            {user ? (
              <div>
                <div className="flex items-center gap-3">
                  {user.avatarUrl ? (
                    <span
                      className="h-12 w-12 shrink-0 rounded-full bg-cover bg-center ring-1 ring-[#d4af37]/25"
                      style={{ backgroundImage: `url(${user.avatarUrl})` }}
                      aria-label={user.displayName}
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#d4af37] text-[15px] font-bold text-[#071b33]">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-white">{user.displayName}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-[#6b8299]">
                      {user.discordId ? `Discord-ID ${user.discordId}` : user.username}
                    </p>
                  </div>
                </div>
                <div className="mt-5 rounded-[12px] border border-[#18385f]/55 bg-[#071a30]/60 p-3">
                  {applicationLoading ? (
                    <p className="text-[12.5px] text-[#8ea4bd]">Bewerbungsstatus wird geladen...</p>
                  ) : application ? (
                    <ApplicationStatus application={application} />
                  ) : (
                    <div className="flex items-start gap-2">
                      <UserRound size={15} className="mt-0.5 shrink-0 text-[#d4af37]" />
                      <p className="text-[12.5px] leading-5 text-[#9fb0c4]">
                        Für dieses Discord-Konto liegt noch keine Bewerbung vor.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[11px] bg-[#5865f2]/15 text-[#9aa8ff]">
                  <ShieldCheck size={20} />
                </div>
                <h2 className="text-[15px] font-semibold text-white">Bewerbung mit Discord</h2>
                <p className="mt-2 text-[12.5px] leading-5 text-[#9fb0c4]">
                  Melde dich mit deinem Discord-Konto an, um eine Bewerbung einzureichen oder den Status zu sehen.
                </p>
                <Button type="button" className="mt-5 w-full" onClick={startApplicationLogin}>
                  Discord anmelden
                </Button>
              </div>
            )}
          </aside>
        </section>

        <section id="bewerbung" className="scroll-mt-section mb-6 rounded-[16px] border border-[#1e3a5c]/55 bg-[#091e36]/70 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <Briefcase size={16} className="text-[#d4af37]" />
                <h2 className="text-[15px] font-semibold text-white">Bewerbungen</h2>
              </div>
              <p className="max-w-2xl text-[12.5px] leading-5 text-[#8ea4bd]">
                Im Bewerbungsbereich beantwortest du die Fragen und siehst danach live deinen aktuellen Status.
              </p>
            </div>
            <Link href="/bewerbung">
              <Button size="sm">
                Bewerbung öffnen
                <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
        </section>

        <section id="presse" className="scroll-mt-section mb-6">
          <PortalSectionHeader
            icon={Megaphone}
            title="Pressemitteilungen"
            description="Öffentlich freigegebene Meldungen des Departments."
            detail={`${releases.length} veröffentlicht`}
          />

          {pressLoading ? (
            <PageLoader />
          ) : releases.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
              <div className="space-y-2">
                {releases.map((release) => (
                  <button
                    key={release.id}
                    type="button"
                    onClick={() => setSelectedPressId(release.id)}
                    className={cn(
                      'block w-full rounded-[13px] border px-4 py-3 text-left transition-colors',
                      selectedPress?.id === release.id
                        ? 'border-[#d4af37]/35 bg-[#102542]/80'
                        : 'border-[#1e3a5c]/55 bg-[#091e36]/70 hover:border-[#234568]',
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="line-clamp-2 text-[13.5px] font-semibold leading-5 text-white">{release.title}</p>
                      <span className={cn('shrink-0 rounded-[6px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]', PRESS_RELEASE_STATUS_META[release.status].tone)}>
                        {PRESS_RELEASE_STATUS_META[release.status].label}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[12px] leading-5 text-[#8ea4bd]">{release.summary || pressReleaseExcerpt(release.content)}</p>
                    <p className="mt-2 text-[10.5px] text-[#536b86]">{formatDateTime(release.publishedAt ?? release.createdAt)}</p>
                  </button>
                ))}
              </div>

              {selectedPress && (
                <article className="overflow-hidden rounded-[16px] border border-[#1e3a5c]/55 bg-[#091e36]/70">
                  <div
                    className="aspect-[16/7] min-h-[220px] bg-[#102542] bg-cover bg-center"
                    style={selectedPress.imageUrl ? { backgroundImage: `url(${selectedPress.imageUrl})` } : undefined}
                    aria-label={selectedPress.imageAlt ?? selectedPress.title}
                  >
                    {!selectedPress.imageUrl && (
                      <div className="flex h-full items-center justify-center text-[#6b8299]">
                        <FileText size={36} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                  <div className="p-5 sm:p-6">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d4af37]/80">
                      {formatDateTime(selectedPress.publishedAt ?? selectedPress.createdAt)}
                    </p>
                    <h3 className="max-w-3xl text-[24px] font-semibold leading-tight tracking-[-0.01em] text-white">{selectedPress.title}</h3>
                    {selectedPress.summary && <p className="mt-3 max-w-3xl text-[14px] leading-6 text-[#bfd0e2]">{selectedPress.summary}</p>}
                    <div
                      className="markdown-document mt-5 max-w-none text-[13.5px] leading-7 text-[#dbe6f3]"
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

        <section id="mitarbeiter" className="scroll-mt-section">
          <PortalSectionHeader
            icon={Building2}
            title="Mitarbeiterliste"
            description="Öffentliche Übersicht mit Rang, Unit und Einstellungsdatum."
            detail={`${filteredOfficers.length} Mitarbeiter`}
          />

          <div className="overflow-hidden rounded-[16px] border border-[#1e3a5c]/55 bg-[#091e36]/70">
            <div className="flex flex-col gap-3 border-b border-[#18385f]/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:w-[320px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6585]" strokeWidth={1.75} />
                <input
                  value={officerSearch}
                  onChange={(event) => setOfficerSearch(event.target.value)}
                  placeholder="Name, DN, Rang oder Unit..."
                  className="h-[36px] w-full rounded-[8px] border border-[#18385f]/70 bg-[#0b1f3a] pl-9 pr-3 text-[13px] text-[#edf4fb] placeholder:text-[#4a6585] focus:border-[#d4af37] focus:outline-none"
                />
              </div>
              <Link href="/public/officers" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#d4af37] hover:text-[#f0d060]">
                Einzelansicht öffnen
                <ArrowRight size={12} />
              </Link>
            </div>

            {officersLoading ? (
              <PageLoader />
            ) : filteredOfficers.length > 0 ? (
              <div className="max-h-[620px] overflow-y-auto">
                <div className="hidden grid-cols-[92px_minmax(0,1.2fr)_minmax(140px,0.8fr)_minmax(150px,1fr)_130px] gap-4 border-b border-[#18385f]/60 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#6b8299] lg:grid">
                  <span>DN</span>
                  <span>Name</span>
                  <span>Rang</span>
                  <span>Unit</span>
                  <span>Einstellung</span>
                </div>
                {filteredOfficers.map((officer) => (
                  <div
                    key={`${officer.badgeNumber}-${officer.firstName}-${officer.lastName}`}
                    className="grid grid-cols-1 gap-2 border-b border-[#18385f]/60 px-4 py-3.5 last:border-b-0 lg:grid-cols-[92px_minmax(0,1.2fr)_minmax(140px,0.8fr)_minmax(150px,1fr)_130px] lg:items-center lg:gap-4"
                  >
                    <span className="font-mono text-[12px] text-[#b7c5d8]">{displayBadgeNumber(officer.badgeNumber)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium text-[#eee]">{officer.firstName} {officer.lastName}</p>
                    </div>
                    <p className="truncate text-[12.5px] text-[#c8d5e5]">{officer.rank.name}</p>
                    <span className="flex min-w-0 flex-wrap gap-1">
                      {officer.unitInfo.map((unit) => (
                        <span
                          key={unit.key}
                          className="inline-flex items-center rounded-full border bg-[#0f2340]/70 px-2 py-[3px] text-[10.5px] font-medium"
                          style={{ color: unit.color, borderColor: `${unit.color}66` }}
                        >
                          {unit.name}
                        </span>
                      ))}
                      {officer.unitInfo.length === 0 && <span className="text-[12px] text-[#536b86]">Keine Unit</span>}
                    </span>
                    <span className="text-[12px] text-[#8ea4bd]">{formatDate(officer.hireDate)}</span>
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
      <div className="mb-2 flex items-center gap-2">
        <BadgeCheck size={15} className="text-[#d4af37]" />
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </div>
      <p className="text-[12.5px] leading-5 text-[#dbe6f3]">{application.statusText}</p>
      <p className="mt-2 text-[10.5px] text-[#536b86]">Aktualisiert {formatDateTime(application.updatedAt)}</p>
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
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Icon size={16} className="text-[#d4af37]" />
          <h2 className="text-[16px] font-semibold text-white">{title}</h2>
        </div>
        <p className="text-[12.5px] leading-5 text-[#8ea4bd]">{description}</p>
      </div>
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#6b8299]">{detail}</span>
    </div>
  )
}

function EmptyPanel({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <Icon size={28} className="mb-3 text-[#4a6585]" strokeWidth={1.5} />
      <p className="text-[13px] text-[#8ea4bd]">{text}</p>
    </div>
  )
}
