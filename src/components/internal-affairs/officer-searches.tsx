'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  CalendarClock,
  ChevronRight,
  Clock3,
  FileSearch,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
} from 'lucide-react'

import { OfficerAvatar } from '@/components/officers/officer-avatar'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { PageLoader } from '@/components/ui/loading'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { useFetch } from '@/hooks/use-fetch'
import { displayBadgeNumber } from '@/lib/badge-number'
import { cn, formatDateTime, getStatusLabel } from '@/lib/utils'

type RankLite = { id: string; name: string; color: string }

type OfficerListItem = {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string
  status: string
  rank: RankLite
  avatarUrl: string | null
  searchCount: number
  lastSearchAt: string | null
}

type SearchEntry = {
  id: string
  conductedAt: string
  prohibitedItemsFound: boolean
  foundItems: string
  notes: string | null
  createdAt: string
  createdBy: { id: string; displayName: string } | null
}

type OfficerSearchFile = {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string
  status: string
  rank: RankLite
  searches: SearchEntry[]
}

type SearchForm = {
  conductedAt: string
  prohibitedItemsFound: boolean
  foundItems: string
  notes: string
}

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function emptyForm(): SearchForm {
  return {
    conductedAt: localDateTimeValue(),
    prohibitedItemsFound: false,
    foundItems: '',
    notes: '',
  }
}

function searchDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function searchTime(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function ResultCard({ entry, canManage, onDelete }: {
  entry: SearchEntry
  canManage: boolean
  onDelete: (entry: SearchEntry) => void
}) {
  return (
    <article className="group relative pl-7">
      <span className="absolute left-[5px] top-0 h-full w-px bg-gradient-to-b from-[#0ea5e9]/55 via-[#214666] to-transparent" aria-hidden />
      <span className={cn(
        'absolute left-0 top-5 h-[11px] w-[11px] rounded-full border-2 border-[#07182e] ring-1',
        entry.prohibitedItemsFound
          ? 'bg-[#fb7185] ring-[#fb7185]/45'
          : 'bg-[#34d399] ring-[#34d399]/40',
      )} aria-hidden />

      <div className="overflow-hidden rounded-[15px] border border-[#18385f]/75 bg-[#091c35]/78 shadow-[0_10px_30px_rgba(0,0,0,.1)]">
        <header className="flex flex-col gap-3 border-b border-[#18385f]/60 bg-[#07182e]/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#0ea5e9]/20 bg-[#0ea5e9]/[0.07] text-[#7dd3fc]">
              <CalendarClock size={16} strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold text-[#edf4fb]">{searchDate(entry.conductedAt)}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[#68819a]"><Clock3 size={10} /> {searchTime(entry.conductedAt)} Uhr</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[9.5px] font-bold uppercase tracking-[0.08em]',
              entry.prohibitedItemsFound
                ? 'border-[#fb7185]/25 bg-[#fb7185]/[0.08] text-[#fda4af]'
                : 'border-[#34d399]/20 bg-[#34d399]/[0.07] text-[#6ee7b7]',
            )}>
              {entry.prohibitedItemsFound ? <ShieldAlert size={11} /> : <ShieldCheck size={11} />}
              Verbotene Gegenstände: {entry.prohibitedItemsFound ? 'Ja' : 'Nein'}
            </span>
            {canManage && (
              <button
                type="button"
                onClick={() => onDelete(entry)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#58718c] opacity-100 transition-colors hover:bg-[#fb7185]/10 hover:text-[#fda4af] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                aria-label={`Durchsuchung vom ${searchDate(entry.conductedAt)} löschen`}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </header>

        <div className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_190px]">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-[#67819b]">
              <PackageOpen size={11} /> Gefundene / abgenommene Gegenstände
            </p>
            {entry.foundItems ? (
              <p className="whitespace-pre-wrap text-[12.5px] leading-5 text-[#cbd7e5]">{entry.foundItems}</p>
            ) : (
              <p className="text-[12px] italic text-[#58718c]">Keine Gegenstände dokumentiert</p>
            )}
            {entry.notes && (
              <div className="mt-4 border-t border-[#18385f]/45 pt-3">
                <p className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.13em] text-[#67819b]">Ergebnis / Notiz</p>
                <p className="whitespace-pre-wrap text-[12px] leading-5 text-[#9eb0c3]">{entry.notes}</p>
              </div>
            )}
          </div>
          <aside className="rounded-xl border border-[#18385f]/55 bg-[#07182e]/45 p-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#57718b]">Eingetragen von</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-[#c7d5e3]"><UserRoundCheck size={12} className="text-[#7dd3fc]" /> {entry.createdBy?.displayName ?? 'Gelöschter Benutzer'}</p>
            <p className="mt-2 text-[10px] leading-4 text-[#58718c]">Erfasst am<br />{formatDateTime(entry.createdAt)}</p>
          </aside>
        </div>
      </div>
    </article>
  )
}

export function OfficerSearches({ canManage }: { canManage: boolean }) {
  const { data: officers, loading, error, refetch: refetchOfficers } = useFetch<OfficerListItem[]>('/api/internal-affairs/officers')
  const [selectedOfficerId, setSelectedOfficerId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<SearchForm>(() => emptyForm())
  const { execute, loading: saving } = useApi()
  const { addToast } = useToast()

  useEffect(() => {
    if (!selectedOfficerId && officers?.length) setSelectedOfficerId(officers[0].id)
  }, [officers, selectedOfficerId])

  const selectedOfficer = officers?.find((officer) => officer.id === selectedOfficerId) ?? null
  const detailUrl = selectedOfficerId
    ? `/api/internal-affairs/searches?officerId=${encodeURIComponent(selectedOfficerId)}`
    : null
  const { data: searchFile, loading: detailLoading, error: detailError, refetch: refetchSearchFile } = useFetch<OfficerSearchFile>(detailUrl)
  const activeSearchFile = searchFile?.id === selectedOfficerId ? searchFile : null

  const filteredOfficers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de-DE')
    if (!needle) return officers ?? []
    return (officers ?? []).filter((officer) => (
      `${officer.firstName} ${officer.lastName} ${officer.badgeNumber} ${officer.rank.name}`
        .toLocaleLowerCase('de-DE')
        .includes(needle)
    ))
  }, [officers, query])

  const totalSearches = useMemo(
    () => (officers ?? []).reduce((sum, officer) => sum + officer.searchCount, 0),
    [officers],
  )

  const openCreate = () => {
    setForm(emptyForm())
    setModalOpen(true)
  }

  const createSearch = async () => {
    if (!selectedOfficer || !form.conductedAt) return
    try {
      await execute('/api/internal-affairs/searches', {
        method: 'POST',
        body: JSON.stringify({
          officerId: selectedOfficer.id,
          conductedAt: new Date(form.conductedAt).toISOString(),
          prohibitedItemsFound: form.prohibitedItemsFound,
          foundItems: form.foundItems,
          notes: form.notes,
        }),
      })
      setModalOpen(false)
      addToast({ type: 'success', title: 'Durchsuchung eingetragen', message: `Die Akte von ${selectedOfficer.firstName} ${selectedOfficer.lastName} wurde aktualisiert.` })
      await Promise.all([refetchSearchFile(), refetchOfficers()])
    } catch (cause) {
      addToast({ type: 'error', title: 'Durchsuchung konnte nicht gespeichert werden', message: cause instanceof Error ? cause.message : '' })
    }
  }

  const deleteSearch = async (entry: SearchEntry) => {
    if (!window.confirm(`Durchsuchung vom ${searchDate(entry.conductedAt)} wirklich löschen?`)) return
    try {
      await execute(`/api/internal-affairs/searches/${entry.id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Durchsuchung gelöscht' })
      await Promise.all([refetchSearchFile(), refetchOfficers()])
    } catch (cause) {
      addToast({ type: 'error', title: 'Durchsuchung konnte nicht gelöscht werden', message: cause instanceof Error ? cause.message : '' })
    }
  }

  if (loading && !officers) return <PageLoader />

  return (
    <div>
      <PageHeader
        eyebrow="IA · Durchsuchungsregister"
        title="Officer-Durchsuchungen"
        description={`${officers?.length ?? 0} Officers · ${totalSearches} dokumentierte ${totalSearches === 1 ? 'Durchsuchung' : 'Durchsuchungen'}`}
        action={<Button variant="secondary" size="sm" onClick={() => void refetchOfficers()}><RefreshCw size={13} /> Aktualisieren</Button>}
      />

      {error && (
        <div className="mb-4 rounded-xl border border-[#fb7185]/25 bg-[#fb7185]/[0.06] px-4 py-3 text-[12px] text-[#fda4af]">{error}</div>
      )}

      <div className="grid min-h-[610px] overflow-hidden rounded-[17px] border border-[#18385f]/75 bg-[#07182e]/38 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="border-b border-[#18385f]/75 bg-[#07182e]/58 lg:border-b-0 lg:border-r">
          <div className="border-b border-[#18385f]/65 p-3.5">
            <label className="relative block">
              <span className="sr-only">Officers durchsuchen</span>
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#56718c]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, Dienstnummer oder Rang"
                className="h-9 w-full rounded-[9px] border border-[#18385f]/75 bg-[#091d37]/75 pl-9 pr-3 text-[12px] text-[#edf4fb] outline-none transition-colors placeholder:text-[#4e6984] focus:border-[#0ea5e9]/55 focus:ring-2 focus:ring-[#0ea5e9]/10"
              />
            </label>
          </div>

          <div className="max-h-[310px] space-y-1 overflow-y-auto p-2 lg:max-h-[552px]">
            {filteredOfficers.map((officer) => {
              const selected = officer.id === selectedOfficerId
              return (
                <button
                  key={officer.id}
                  type="button"
                  onClick={() => setSelectedOfficerId(officer.id)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9]/35',
                    selected
                      ? 'border-[#0ea5e9]/28 bg-[#0ea5e9]/[0.075] shadow-[inset_3px_0_0_#0ea5e9]'
                      : 'border-transparent hover:border-[#18385f]/70 hover:bg-[#0b213e]/75',
                  )}
                >
                  <OfficerAvatar officer={officer} size="md" ringColor={selected ? '#0ea5e9' : officer.rank.color} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[9.5px] font-bold text-[#7dd3fc]">{displayBadgeNumber(officer.badgeNumber)}</span>
                      <span className="truncate text-[12px] font-semibold text-[#dce7f2]">{officer.firstName} {officer.lastName}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[#607994]">{officer.rank.name} · {getStatusLabel(officer.status)}</span>
                    <span className="mt-1 block text-[9.5px] text-[#526c86]">
                      {officer.searchCount === 0 ? 'Noch keine Durchsuchung' : `${officer.searchCount} ${officer.searchCount === 1 ? 'Eintrag' : 'Einträge'} · zuletzt ${searchDate(officer.lastSearchAt!)}`}
                    </span>
                  </span>
                  <ChevronRight size={13} className={cn('shrink-0 transition-transform', selected ? 'translate-x-0.5 text-[#7dd3fc]' : 'text-[#3f5d79] group-hover:translate-x-0.5')} />
                </button>
              )
            })}

            {filteredOfficers.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Search size={21} className="mx-auto mb-2 text-[#3f5d79]" />
                <p className="text-[11.5px] text-[#607994]">Keine Officers gefunden</p>
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,.045),transparent_38%)]">
          {selectedOfficer ? (
            <>
              <header className="flex flex-col gap-4 border-b border-[#18385f]/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3.5">
                  <OfficerAvatar officer={selectedOfficer} size="lg" ringColor="#0ea5e9" />
                  <div className="min-w-0">
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#7dd3fc]">Durchsuchungsakte · {displayBadgeNumber(selectedOfficer.badgeNumber)}</p>
                    <h2 className="mt-1 truncate text-[19px] font-semibold tracking-[-0.02em] text-white">{selectedOfficer.firstName} {selectedOfficer.lastName}</h2>
                    <p className="mt-0.5 truncate text-[10.5px] text-[#68819a]">{selectedOfficer.rank.name} · {getStatusLabel(selectedOfficer.status)}</p>
                  </div>
                </div>
                {canManage && <Button size="sm" onClick={openCreate}><Plus size={13} /> Durchsuchung hinzufügen</Button>}
              </header>

              <div className="p-4 sm:p-5">
                {detailError && <div className="mb-4 rounded-xl border border-[#fb7185]/25 bg-[#fb7185]/[0.06] px-4 py-3 text-[12px] text-[#fda4af]">{detailError}</div>}
                {detailLoading && !activeSearchFile ? (
                  <div className="flex min-h-[360px] items-center justify-center"><PageLoader /></div>
                ) : activeSearchFile?.searches.length ? (
                  <div className="space-y-4">
                    {activeSearchFile.searches.map((entry) => (
                      <ResultCard key={entry.id} entry={entry} canManage={canManage} onDelete={deleteSearch} />
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[380px] flex-col items-center justify-center rounded-[15px] border border-dashed border-[#1d4265] bg-[#081a31]/38 px-6 text-center">
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#0ea5e9]/20 bg-[#0ea5e9]/[0.06] text-[#5bbde7]"><Archive size={23} strokeWidth={1.6} /></span>
                    <p className="text-[13px] font-semibold text-[#b8c8d8]">Noch keine Durchsuchung dokumentiert</p>
                    <p className="mt-1.5 max-w-sm text-[11px] leading-5 text-[#5c7690]">Neue Einträge erscheinen hier chronologisch mit Ergebnis, Gegenständen und erfassender Person.</p>
                    {canManage && <Button className="mt-5" size="sm" onClick={openCreate}><Plus size={13} /> Erste Durchsuchung eintragen</Button>}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-[600px] flex-col items-center justify-center px-6 text-center">
              <FileSearch size={30} className="mb-3 text-[#45647f]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#7d94aa]">Wähle einen Officer aus, um die Durchsuchungsakte zu öffnen.</p>
            </div>
          )}
        </section>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Durchsuchung eintragen"
        description={selectedOfficer ? `${displayBadgeNumber(selectedOfficer.badgeNumber)} · ${selectedOfficer.firstName} ${selectedOfficer.lastName}` : undefined}
        size="lg"
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="search-conducted-at" className="mb-1.5 block text-[12.5px] font-medium text-[#9fb0c4]">Durchgeführt am</label>
            <input
              id="search-conducted-at"
              type="datetime-local"
              value={form.conductedAt}
              onChange={(event) => setForm({ ...form, conductedAt: event.target.value })}
              className="h-9 w-full rounded-[9px] border border-[#18385f]/70 bg-[#0a1a33]/60 px-3 text-[13px] text-[#edf4fb] outline-none transition-all focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#0ea5e9]/10"
              required
            />
          </div>

          <fieldset>
            <legend className="mb-2 block text-[12.5px] font-medium text-[#9fb0c4]">Verbotene Gegenstände gefunden?</legend>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#18385f]/60 bg-[#07182e]/45 p-1.5">
              <button
                type="button"
                onClick={() => setForm({ ...form, prohibitedItemsFound: false })}
                aria-pressed={!form.prohibitedItemsFound}
                className={cn('flex h-9 items-center justify-center gap-2 rounded-[8px] text-[12px] font-semibold transition-colors', !form.prohibitedItemsFound ? 'bg-[#34d399]/12 text-[#6ee7b7] shadow-[inset_0_0_0_1px_rgba(52,211,153,.2)]' : 'text-[#607994] hover:text-[#9eb0c3]')}
              >
                <ShieldCheck size={14} /> Nein
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, prohibitedItemsFound: true })}
                aria-pressed={form.prohibitedItemsFound}
                className={cn('flex h-9 items-center justify-center gap-2 rounded-[8px] text-[12px] font-semibold transition-colors', form.prohibitedItemsFound ? 'bg-[#fb7185]/12 text-[#fda4af] shadow-[inset_0_0_0_1px_rgba(251,113,133,.2)]' : 'text-[#607994] hover:text-[#9eb0c3]')}
              >
                <ShieldAlert size={14} /> Ja
              </button>
            </div>
          </fieldset>

          <Textarea
            label="Gefundene / abgenommene Gegenstände"
            value={form.foundItems}
            onChange={(event) => setForm({ ...form, foundItems: event.target.value })}
            placeholder={'Falls vorhanden, Gegenstände einzeln auflisten\n– Gegenstand 1\n– Gegenstand 2'}
            rows={5}
            required={form.prohibitedItemsFound}
          />
          <Textarea
            label="Ergebnis / Notiz (optional)"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Zusätzliche Feststellungen oder Maßnahmen"
            rows={3}
          />

          <div className="rounded-[10px] border border-[#0ea5e9]/15 bg-[#0ea5e9]/[0.045] px-3 py-2.5 text-[10.5px] leading-4 text-[#6e8aa3]">
            Ersteller und Eintragungszeit werden automatisch gespeichert. Einträge bleiben unverändert; Korrekturen erfolgen durch Löschen und erneutes Erfassen.
          </div>

          <div className="flex justify-end gap-2 border-t border-[#18385f]/60 pt-4">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={() => void createSearch()} disabled={!selectedOfficer || !form.conductedAt || (form.prohibitedItemsFound && !form.foundItems.trim()) || saving} loading={saving}>Durchsuchung speichern</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
