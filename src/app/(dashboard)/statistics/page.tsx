'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { PageLoader } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/auth-context'
import { useFetch } from '@/hooks/use-fetch'
import { hasPermission } from '@/lib/permissions'
import { cn, formatDateTime } from '@/lib/utils'
import type {
  StatisticsMetric,
  StatisticsPayload,
  StatisticsRange,
  StatisticsSeriesPoint,
  StatisticsStaffRow,
} from '@/lib/statistics'

const panelClass = 'rounded-[12px] border border-line bg-surface'
const surfaceClass = 'rounded-[11px] border border-white/[0.055] bg-surface'

const rangeOptions: Array<{ value: StatisticsRange; label: string; shortLabel: string }> = [
  { value: 'week', label: 'Diese Woche', shortLabel: 'Woche' },
  { value: '30d', label: 'Letzte 30 Tage', shortLabel: '30 Tage' },
  { value: '90d', label: 'Letzte 90 Tage', shortLabel: '90 Tage' },
  { value: 'year', label: 'Dieses Jahr', shortLabel: 'Jahr' },
]

type MetricTone = 'emerald' | 'sky' | 'gold' | 'rose' | 'amber' | 'violet'

const tones: Record<MetricTone, { color: string; bg: string; border: string }> = {
  emerald: { color: '#32d74b', bg: 'rgba(50,215,75,.10)', border: 'rgba(50,215,75,.24)' },
  sky: { color: '#64d2ff', bg: 'rgba(100,210,255,.10)', border: 'rgba(100,210,255,.24)' },
  gold: { color: '#d4af37', bg: 'rgba(212,175,55,.11)', border: 'rgba(212,175,55,.26)' },
  rose: { color: '#ff453a', bg: 'rgba(255,69,58,.10)', border: 'rgba(255,69,58,.24)' },
  amber: { color: '#ffd60a', bg: 'rgba(255,214,10,.10)', border: 'rgba(255,214,10,.24)' },
  violet: { color: '#bf5af2', bg: 'rgba(191,90,242,.10)', border: 'rgba(191,90,242,.24)' },
}

const seriesLegend: Array<{
  field: keyof Pick<StatisticsSeriesPoint, 'hires' | 'trainingCompletions' | 'promotions' | 'demotions' | 'terminations'>
  label: string
  color: string
}> = [
  { field: 'hires', label: 'Einstellungen', color: '#64d2ff' },
  { field: 'trainingCompletions', label: 'Ausbildungen', color: '#d4af37' },
  { field: 'promotions', label: 'Up-Ranks', color: '#32d74b' },
  { field: 'demotions', label: 'D-Ranks', color: '#ff9f0a' },
  { field: 'terminations', label: 'Kündigungen', color: '#ff453a' },
]

const activityMeta: Record<StatisticsPayload['latestActivity'][number]['type'], { icon: LucideIcon; color: string; bg: string }> = {
  HIRE: { icon: UserPlus, color: '#64d2ff', bg: 'rgba(100,210,255,.11)' },
  TRAINING: { icon: GraduationCap, color: '#d4af37', bg: 'rgba(212,175,55,.11)' },
  PROMOTION: { icon: ArrowUpRight, color: '#32d74b', bg: 'rgba(50,215,75,.11)' },
  DEMOTION: { icon: ArrowDownRight, color: '#ff9f0a', bg: 'rgba(255,159,10,.11)' },
  TERMINATION: { icon: UserMinus, color: '#ff453a', bg: 'rgba(255,69,58,.11)' },
}

function DeltaLabel({ metric }: { metric: StatisticsMetric }) {
  const delta = metric.current - metric.previous
  if (delta === 0) return <span className="text-label-3">wie zuvor</span>
  return (
    <span className={delta > 0 ? 'text-green' : 'text-red'}>
      {delta > 0 ? '+' : ''}{delta} zur Vorperiode
    </span>
  )
}

function MetricCard({
  label,
  metric,
  icon: Icon,
  tone,
  hint,
}: {
  label: string
  metric: StatisticsMetric
  icon: LucideIcon
  tone: MetricTone
  hint: string
}) {
  const color = tones[tone]
  return (
    <article className={cn(panelClass, 'group relative overflow-hidden p-4 transition-colors hover:border-line-strong')}>
      <span className="absolute inset-x-0 top-0 h-px opacity-80" style={{ background: `linear-gradient(90deg, transparent, ${color.color}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-label-3">{label}</p>
          <p className="mt-2 text-[27px] font-semibold leading-none tracking-[-0.035em] text-label tabular-nums">{metric.current}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border" style={{ color: color.color, backgroundColor: color.bg, borderColor: color.border }}>
          <Icon size={17} strokeWidth={1.9} />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
        <DeltaLabel metric={metric} />
        <span className="truncate text-label-4" title={hint}>{hint}</span>
      </div>
    </article>
  )
}

function SectionHeading({ icon: Icon, title, description, aside }: { icon: LucideIcon; title: string; description: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-gold/18 bg-gold/9 text-gold">
          <Icon size={15} strokeWidth={1.9} />
        </span>
        <div>
          <h2 className="text-[13.5px] font-semibold text-label">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-4 text-label-3">{description}</p>
        </div>
      </div>
      {aside}
    </div>
  )
}

function ActivityChart({ points }: { points: StatisticsSeriesPoint[] }) {
  const totals = points.map((point) => seriesLegend.reduce((total, item) => total + point[item.field], 0))
  const max = Math.max(...totals, 1)
  const labelEvery = Math.max(1, Math.ceil(points.length / 9))

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
        {seriesLegend.map((item) => (
          <span key={item.field} className="inline-flex items-center gap-1.5 text-[11px] text-label-2">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40">
          {[0, 1, 2, 3].map((line) => <span key={line} className="absolute inset-x-0 border-t border-dashed border-white/[0.045]" style={{ top: `${line * 33.333}%` }} />)}
        </div>
        <div className="grid h-[182px] items-end gap-1 sm:gap-1.5" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
          {points.map((point, index) => {
            const values = seriesLegend.map((item) => point[item.field])
            const total = values.reduce((sum, value) => sum + value, 0)
            const title = `${point.label}: ${seriesLegend.map((item, itemIndex) => `${item.label} ${values[itemIndex]}`).join(', ')}`
            const showLabel = points.length <= 14 || index % labelEvery === 0 || index === points.length - 1
            return (
              <div key={point.key} className="group flex h-full min-w-0 flex-col justify-end" title={title} aria-label={title}>
                <div className="relative flex h-40 flex-col-reverse justify-start overflow-hidden rounded-t-[4px] bg-surface ring-1 ring-inset ring-white/[0.035] transition-colors group-hover:bg-surface-2">
                  {seriesLegend.map((item) => {
                    const value = point[item.field]
                    return (
                      <span
                        key={item.field}
                        className="block w-full transition-[filter] group-hover:brightness-125"
                        style={{ height: `${(value / max) * 100}%`, minHeight: value > 0 ? 3 : 0, backgroundColor: item.color }}
                      />
                    )
                  })}
                  {total > 0 && <span className="absolute inset-x-0 top-1 text-center text-[11px] font-semibold text-white/75 tabular-nums">{total}</span>}
                </div>
                <span className={cn('mt-2 truncate text-center text-[11px] text-label-4', !showLabel && 'invisible')}>{point.shortLabel}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StaffAvatar({ row }: { row: StatisticsStaffRow }) {
  if (row.avatarUrl) {
    return <span className="h-8 w-8 shrink-0 rounded-full bg-cover bg-center ring-1 ring-gold/22" style={{ backgroundImage: `url(${row.avatarUrl})` }} aria-hidden />
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-gold ring-1 ring-line-strong">
      {row.displayName.charAt(0).toUpperCase()}
    </span>
  )
}

function LeaderCard({ label, row, value, icon: Icon }: { label: string; row: StatisticsStaffRow | undefined; value: number; icon: LucideIcon }) {
  return (
    <div className={cn(surfaceClass, 'flex min-w-0 items-center gap-3 px-3 py-2.5')}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-gold/10 text-gold"><Icon size={14} /></span>
      <div className="min-w-0">
        <p className="text-[11px] text-label-4">{label}</p>
        <p className="mt-0.5 truncate text-[11.5px] font-medium text-label">{row ? `${row.displayName} · ${value}` : 'Noch keine Daten'}</p>
      </div>
    </div>
  )
}

export default function StatisticsPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'dashboard:view')
  const [range, setRange] = useState<StatisticsRange>('week')
  const [staffSearch, setStaffSearch] = useState('')
  const { data, loading, error, refetch } = useFetch<StatisticsPayload>(canView ? `/api/statistics?range=${range}` : null)

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLocaleLowerCase('de-DE')
    return (data?.staff ?? []).filter((row) => !query || row.displayName.toLocaleLowerCase('de-DE').includes(query))
  }, [data?.staff, staffSearch])

  if (!canView) return <UnauthorizedContent />
  if (loading) return <PageLoader />
  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className={cn(panelClass, 'mt-6 px-6 py-16 text-center')}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red/15 bg-red/10 text-red"><AlertTriangle size={22} /></span>
          <h1 className="mt-4 text-[16px] font-semibold text-label">Statistik nicht verfügbar</h1>
          <p className="mx-auto mt-1.5 max-w-md text-[12.5px] text-label-2">{error ?? 'Die Statistikdaten konnten nicht geladen werden.'}</p>
          <Button size="sm" className="mt-5" onClick={refetch}><RefreshCw size={13} /> Erneut laden</Button>
        </div>
      </div>
    )
  }

  const periodText = `${new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(data.period.start))} – ${new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(data.period.end))}`
  const rankMax = Math.max(...data.rankDistribution.map((rank) => rank.count), 1)
  const recruiter = [...data.staff].sort((a, b) => b.hires - a.hires)[0]
  const trainer = [...data.staff].sort((a, b) => b.trainingCompletions - a.trainingCompletions)[0]
  const rankLead = [...data.staff].sort((a, b) => (b.promotions + b.demotions) - (a.promotions + a.demotions))[0]
  const applicationTotal = data.applicationFunnel.reduce((total, item) => total + item.count, 0)

  return (
    <div className="mx-auto max-w-[1500px] pb-4">
      <PageHeader
        eyebrow="Personalführung · Lagebericht"
        title="Statistik & Entwicklung"
        description="Personalbewegungen, Ausbildungsstand und Bearbeiterleistung transparent überblicken. Alle Vergleiche beziehen sich auf den gleich langen vorherigen Zeitraum."
        action={(
          <div className="inline-flex rounded-[10px] border border-line bg-surface p-1" role="group" aria-label="Statistikzeitraum">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                aria-pressed={range === option.value}
                title={option.label}
                className={cn(
                  'h-8 rounded-[7px] px-2.5 text-[11px] font-semibold transition-colors sm:px-3',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40',
                  range === option.value ? 'bg-gold text-ink ' : 'text-label-3 hover:bg-surface-2 hover:text-label',
                )}
              >
                {option.shortLabel}
              </button>
            ))}
          </div>
        )}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-surface px-3.5 py-2 text-[11px]">
        <span className="inline-flex items-center gap-2 font-semibold text-gold"><Activity size={12} /> {data.period.label}</span>
        <span className="font-mono text-label-3">{periodText}</span>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Kennzahlen">
        <MetricCard label="Einstellungen" metric={data.overview.hires} icon={UserPlus} tone="sky" hint="im System angelegt" />
        <MetricCard label="Ausbildungen" metric={data.overview.trainingCompletions} icon={GraduationCap} tone="gold" hint="neu abgeschlossen" />
        <MetricCard label="Up-Ranks" metric={data.overview.promotions} icon={ArrowUpRight} tone="emerald" hint="durchgeführt" />
        <MetricCard label="D-Ranks" metric={data.overview.demotions} icon={ArrowDownRight} tone="amber" hint="durchgeführt" />
        <MetricCard label="Kündigungen" metric={data.overview.terminations} icon={UserMinus} tone="rose" hint="Dienst beendet" />
        <MetricCard label="Sanktionen" metric={data.overview.sanctions} icon={ShieldAlert} tone="violet" hint="neu ausgestellt" />
      </section>

      <section className={cn(panelClass, 'mt-3 p-4 sm:p-5')}>
        <SectionHeading icon={BarChart3} title="Personalbewegung im Verlauf" description="Alle erfassten Personalereignisse nach Tag, Woche oder Monat gestapelt." aside={<span className="font-mono text-[11px] text-label-4">GESAMT {data.series.reduce((sum, point) => sum + seriesLegend.reduce((value, item) => value + point[item.field], 0), 0)}</span>} />
        <ActivityChart points={data.series} />
      </section>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <section className={cn(panelClass, 'p-4 sm:p-5')}>
          <SectionHeading icon={Users} title="Personalstand nach Rang" description={`${data.additional.activeOfficers} von ${data.additional.currentOfficers} Officers sind aktuell aktiv.`} />
          <div className="space-y-2.5">
            {data.rankDistribution.map((rank) => (
              <div key={rank.id} className="grid grid-cols-[minmax(110px,170px)_minmax(0,1fr)_28px] items-center gap-3">
                <span className="truncate text-[11px] font-medium" style={{ color: rank.color }}>{rank.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-white/[0.04]">
                  <span className="block h-full rounded-full" style={{ width: `${(rank.count / rankMax) * 100}%`, backgroundColor: rank.color }} />
                </span>
                <span className="text-right text-[11px] font-semibold text-label tabular-nums">{rank.count}</span>
              </div>
            ))}
            {data.rankDistribution.length === 0 && <p className="py-8 text-center text-[12px] italic text-label-4">Keine aktiven Officers vorhanden.</p>}
          </div>
        </section>

        <section className={cn(panelClass, 'p-4 sm:p-5')}>
          <SectionHeading icon={BookOpenCheck} title="Ausbildungslage" description={`${data.additional.completedTrainingAssignments} von ${data.additional.trainingAssignments} Zuweisungen abgeschlossen.`} aside={<span className="text-[18px] font-semibold text-gold tabular-nums">{data.additional.trainingCompletionRate}%</span>} />
          <div className="space-y-3">
            {data.trainingDistribution.slice(0, 8).map((training) => (
              <div key={training.id}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
                  <span className="truncate text-label-2">{training.label}</span>
                  <span className="shrink-0 text-label-3 tabular-nums">{training.completed}/{training.total} · {training.percentage}%</span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-surface">
                  <span className="block h-full rounded-full bg-gold" style={{ width: `${training.percentage}%` }} />
                </span>
              </div>
            ))}
            {data.trainingDistribution.length === 0 && <p className="py-8 text-center text-[12px] italic text-label-4">Keine Ausbildungszuweisungen vorhanden.</p>}
          </div>
        </section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <section className={cn(panelClass, 'p-4 sm:p-5 lg:col-span-2')}>
          <SectionHeading icon={BriefcaseBusiness} title="Bewerbungslage" description={`${applicationTotal} Bewerbungen wurden im gewählten Zeitraum eingereicht.`} />
          <div className="grid gap-2 sm:grid-cols-5">
            {data.applicationFunnel.map((item, index) => {
              const colors = ['#64d2ff', '#4a90f0', '#bf5af2', '#32d74b', '#ff453a']
              return (
                <div key={item.status} className={cn(surfaceClass, 'relative overflow-hidden p-3')}>
                  <span className="absolute inset-x-0 top-0 h-px" style={{ backgroundColor: colors[index] }} />
                  <p className="text-[11px] text-label-4">{item.label}</p>
                  <p className="mt-2 text-[20px] font-semibold text-label tabular-nums">{item.count}</p>
                  <div className="mt-2 h-1 rounded-full bg-surface">
                    <span className="block h-full rounded-full" style={{ width: `${applicationTotal > 0 ? (item.count / applicationTotal) * 100 : 0}%`, backgroundColor: colors[index] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className={cn(panelClass, 'p-4 sm:p-5')}>
          <SectionHeading icon={ClipboardCheck} title="Weitere Kennzahlen" description="Aktueller Personal- und Verwaltungsstand." />
          <dl className="grid grid-cols-2 gap-2">
            {[
              ['Offene Ausbildungen', data.additional.officersWithOpenTrainings],
              ['Bewerbungen', data.additional.applications.current],
              ['Neue Probezeiten', data.additional.probationStarts.current],
              ['Neue Ausbildungsarten', data.additional.newTrainingTypes.current],
            ].map(([label, value]) => (
              <div key={String(label)} className={cn(surfaceClass, 'p-3')}>
                <dt className="text-[11px] leading-4 text-label-3">{label}</dt>
                <dd className="mt-1 text-[18px] font-semibold text-label tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className={cn(panelClass, 'mt-3 p-4 sm:p-5')}>
        <SectionHeading
          icon={Trophy}
          title="Bearbeiterbilanz"
          description="Wer hat Einstellungen, Ausbildungen und Personalmaßnahmen im gewählten Zeitraum bearbeitet?"
          aside={(
            <label className="relative block w-full sm:w-[230px]">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-4" />
              <input value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="PDler suchen…" className="h-8 w-full rounded-[8px] border border-line bg-surface pl-8 pr-3 text-[11px] text-label outline-none transition-colors placeholder:text-label-4 focus:border-gold/55 focus:ring-2 focus:ring-gold/12" />
            </label>
          )}
        />

        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <LeaderCard label="Meiste Einstellungen" row={recruiter?.hires ? recruiter : undefined} value={recruiter?.hires ?? 0} icon={UserPlus} />
          <LeaderCard label="Meiste Ausbildungen" row={trainer?.trainingCompletions ? trainer : undefined} value={trainer?.trainingCompletions ?? 0} icon={GraduationCap} />
          <LeaderCard label="Meiste Rangmaßnahmen" row={rankLead && (rankLead.promotions + rankLead.demotions) > 0 ? rankLead : undefined} value={(rankLead?.promotions ?? 0) + (rankLead?.demotions ?? 0)} icon={Sparkles} />
        </div>

        <div className="overflow-x-auto rounded-[11px] border border-white/[0.055]">
          <table className="lspd-table w-full min-w-[920px] border-collapse text-left">
            <thead className="bg-surface">
              <tr className="text-[11px] text-label-3">
                <th className="px-3 py-2.5 font-semibold">PDler / Bearbeiter</th>
                <th className="px-3 py-2.5 text-center font-semibold">Einstellungen</th>
                <th className="px-3 py-2.5 text-center font-semibold">Ausbildungen</th>
                <th className="px-3 py-2.5 text-center font-semibold">Up-Ranks</th>
                <th className="px-3 py-2.5 text-center font-semibold">D-Ranks</th>
                <th className="px-3 py-2.5 text-center font-semibold">Kündigungen</th>
                <th className="px-3 py-2.5 text-center font-semibold">Sanktionen</th>
                <th className="px-3 py-2.5 text-center font-semibold text-gold">Gesamt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.045] bg-white/[0.03]">
              {filteredStaff.map((row, index) => (
                <tr key={row.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 text-center font-mono text-[11px] text-label-4">{String(index + 1).padStart(2, '0')}</span>
                      <StaffAvatar row={row} />
                      <span className="max-w-[240px] truncate text-[11.5px] font-medium text-label">{row.displayName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-[11.5px] text-cyan tabular-nums">{row.hires}</td>
                  <td className="px-3 py-2.5 text-center text-[11.5px] text-gold-bright tabular-nums">{row.trainingCompletions}</td>
                  <td className="px-3 py-2.5 text-center text-[11.5px] text-green tabular-nums">{row.promotions}</td>
                  <td className="px-3 py-2.5 text-center text-[11.5px] text-orange tabular-nums">{row.demotions}</td>
                  <td className="px-3 py-2.5 text-center text-[11.5px] text-red tabular-nums">{row.terminations}</td>
                  <td className="px-3 py-2.5 text-center text-[11.5px] text-indigo tabular-nums">{row.sanctions}</td>
                  <td className="px-3 py-2.5 text-center text-[12px] font-semibold text-label tabular-nums">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStaff.length === 0 && <p className="bg-white/[0.03] px-4 py-10 text-center text-[12px] italic text-label-4">{staffSearch ? 'Kein Bearbeiter passt zur Suche.' : 'In diesem Zeitraum wurden noch keine Maßnahmen erfasst.'}</p>}
        </div>
        <p className="mt-2.5 text-[11px] leading-4 text-label-4">Ausbildungen zählen neu als abgeschlossen markierte Ausbildungszuweisungen. Änderungen ohne neuen Abschluss werden nicht als Leistung gezählt.</p>
      </section>

      <section className={cn(panelClass, 'mt-3 p-4 sm:p-5')}>
        <SectionHeading icon={Activity} title="Neueste Personalbewegungen" description="Die letzten Ereignisse innerhalb des gewählten Zeitraums." />
        <div className="grid gap-2 lg:grid-cols-2">
          {data.latestActivity.map((item) => {
            const meta = activityMeta[item.type]
            const Icon = meta.icon
            return (
              <article key={item.id} className={cn(surfaceClass, 'flex items-center gap-3 p-3')}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]" style={{ color: meta.color, backgroundColor: meta.bg }}><Icon size={15} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium text-label">{item.subject}</p>
                  <p className="mt-0.5 truncate text-[11px] text-label-3">{item.title} · von {item.actor}</p>
                </div>
                <time className="shrink-0 text-[11px] text-label-4">{formatDateTime(item.createdAt)}</time>
              </article>
            )
          })}
          {data.latestActivity.length === 0 && <p className="py-8 text-center text-[12px] italic text-label-4 lg:col-span-2">Keine Personalbewegungen im gewählten Zeitraum.</p>}
        </div>
      </section>

      <div className="mt-3 flex items-center justify-between gap-3 px-1 text-[11px] text-label-4">
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={11} /> Datenstand {formatDateTime(data.period.end)}</span>
        <span className="font-mono">LSPD · Personalstatistik</span>
      </div>
    </div>
  )
}
