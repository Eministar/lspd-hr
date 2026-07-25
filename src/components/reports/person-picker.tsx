'use client'

import { useMemo, useState } from 'react'
import { Search, UserRound, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ImageField } from '@/components/reports/image-field'
import { personDisplayName } from '@/lib/reports'
import { cn } from '@/lib/utils'

export interface PersonSummary {
  id: string
  fileNumber: string
  firstName: string
  lastName: string
  phone: string | null
  photoUrl: string | null
  idCardImageUrl: string | null
  wanted: boolean
}

export interface PersonDraft {
  personId: string
  name: string
  phone: string
  idCardImageUrl: string
  photoUrl: string
}

export const EMPTY_PERSON_DRAFT: PersonDraft = {
  personId: '',
  name: '',
  phone: '',
  idCardImageUrl: '',
  photoUrl: '',
}

interface PersonPickerProps {
  title: string
  description: string
  people: PersonSummary[]
  value: PersonDraft
  onChange: (value: PersonDraft) => void
}

/**
 * Wählt eine bestehende Personenakte aus oder legt beim Speichern eine neue an.
 * Beides in einem Feld, damit derselbe Täter nicht bei jeder Anzeige neu
 * angelegt wird und die Akte vollständig bleibt.
 */
export function PersonPicker({ title, description, people, value, onChange }: PersonPickerProps) {
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => people.find((person) => person.id === value.personId) ?? null,
    [people, value.personId],
  )

  const matches = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return []
    return people
      .filter((person) => (
        `${person.fileNumber} ${personDisplayName(person)} ${person.phone ?? ''}`
          .toLowerCase()
          .includes(search)
      ))
      .slice(0, 6)
  }, [people, query])

  const update = (patch: Partial<PersonDraft>) => onChange({ ...value, ...patch })

  return (
    <section className="rounded-[12px] border border-[#18385f]/55 bg-[#0a1a33]/40 p-3.5">
      <p className="text-[13px] font-semibold text-white">{title}</p>
      <p className="mt-0.5 text-[11.5px] leading-4 text-[#6b8299]">{description}</p>

      {selected ? (
        <div className="mt-3 flex items-start gap-3 rounded-[10px] border border-[#d4af37]/35 bg-[#d4af37]/10 p-3">
          <PersonAvatar person={selected} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-semibold text-[#d4af37]">{selected.fileNumber}</p>
            <p className="truncate text-[13.5px] font-semibold text-white">{personDisplayName(selected)}</p>
            <p className="mt-0.5 truncate text-[11.5px] text-[#8ea4bd]">
              {selected.phone || 'Keine Telefonnummer hinterlegt'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { update({ personId: '' }); setQuery('') }}
            className="rounded-[7px] border border-[#234568] p-1.5 text-[#8ea4bd] transition-colors hover:text-white"
            aria-label="Auswahl aufheben"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <>
          <div className="relative mt-3">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4a6585]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bestehende Akte suchen (Name, PA-Nummer, Telefon)"
              className="h-[34px] w-full rounded-[8px] border border-[#18385f]/70 bg-[#0a1a33] pl-8 pr-3 text-[13px] text-[#edf4fb] outline-none transition-colors placeholder:text-[#4a6585] focus:border-[#d4af37]"
            />
          </div>

          {matches.length > 0 && (
            <div className="mt-1.5 space-y-1 rounded-[8px] border border-[#18385f]/55 bg-[#071a30]/50 p-1.5">
              {matches.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => { update({ personId: person.id }); setQuery('') }}
                  className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left transition-colors hover:bg-[#102542]/70"
                >
                  <span className="font-mono text-[10.5px] text-[#d4af37]">{person.fileNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-white">{personDisplayName(person)}</span>
                  {person.wanted && <span className="text-[10.5px] font-semibold text-[#fca5a5]">Fahndung</span>}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="Vor- und Nachname"
              value={value.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Max Mustermann"
            />
            <Input
              label="Telefonnummer"
              value={value.phone}
              onChange={(event) => update({ phone: event.target.value })}
              placeholder="555-0123"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ImageField
              label="Bild des Personalausweises"
              value={value.idCardImageUrl}
              onChange={(url) => update({ idCardImageUrl: url })}
            />
            <ImageField
              label="Lichtbild der Person"
              value={value.photoUrl}
              onChange={(url) => update({ photoUrl: url })}
            />
          </div>

          <p className="mt-2 text-[11px] leading-4 text-[#6b8299]">
            Ohne Auswahl wird beim Speichern automatisch eine neue Personenakte angelegt.
          </p>
        </>
      )}
    </section>
  )
}

export function PersonAvatar({ person, size = 'sm' }: { person: PersonSummary | null; size?: 'sm' | 'lg' }) {
  const className = size === 'lg' ? 'h-16 w-16 text-[18px]' : 'h-10 w-10 text-[13px]'
  const name = personDisplayName(person)

  if (person?.photoUrl) {
    return (
      <span
        className={cn('shrink-0 rounded-[10px] bg-cover bg-center ring-1 ring-[#d4af37]/25', className)}
        style={{ backgroundImage: `url(${person.photoUrl})` }}
        aria-label={name}
      />
    )
  }

  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-[10px] bg-[#102542] font-bold text-[#d4af37]', className)}>
      {name ? name.charAt(0).toUpperCase() : <UserRound size={16} />}
    </div>
  )
}
