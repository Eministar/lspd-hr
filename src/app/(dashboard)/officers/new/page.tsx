'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/layout/page-header'
import { UnitMultiSelect } from '@/components/officers/unit-multi-select'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, FileSignature } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'

interface Rank {
  id: string
  name: string
  sortOrder: number
}

interface Unit {
  id: string
  key: string
  name: string
}

interface LinkableApplication {
  id: string
  applicantDisplayName: string
  discordId: string
  discordUsername: string | null
  discordGlobalName: string | null
  status: string
  submittedAt: string
}

interface ContractTemplateOption {
  id: string
  name: string
  isDefault: boolean
}

function formatApplicationDate(value: string) {
  return new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Zerlegt „Vorname Nachname“ aus der Bewerbung in die beiden Formularfelder. */
function splitApplicantName(value: string) {
  const parts = value.replace(/\s+/g, ' ').trim().split(' ')
  if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export default function NewOfficerPage() {
  const router = useRouter()
  const { addToast } = useToast()
  const { data: ranks } = useFetch<Rank[]>('/api/ranks')
  const { data: units } = useFetch<Unit[]>('/api/units?active=true')
  const { data: applications } = useFetch<LinkableApplication[]>('/api/applications/linkable')
  const { data: contractTemplates } = useFetch<ContractTemplateOption[]>('/api/contract-templates?active=true')
  const { execute, loading } = useApi()
  const { user } = useAuth()
  const canCreate = hasPermission(user, 'officers:write')

  const [form, setForm] = useState({
    badgeNumber: '',
    firstName: '',
    lastName: '',
    rankId: '',
    discordId: '',
    notes: '',
    units: [] as string[],
    hireDate: new Date().toISOString().split('T')[0],
    applicationId: '',
    contractTemplateId: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Client-side guard so missing required fields show a clear message instead
    // of a cryptic 400 from the server validation.
    if (!form.firstName.trim() || !form.lastName.trim()) {
      addToast({ type: 'error', title: 'Fehlende Angaben', message: 'Vor- und Nachname sind erforderlich.' })
      return
    }
    if (!form.rankId) {
      addToast({ type: 'error', title: 'Rang fehlt', message: 'Bitte wähle einen Rang aus.' })
      return
    }
    const did = form.discordId.trim()
    if (did && !/^\d{17,22}$/.test(did)) {
      addToast({ type: 'error', title: 'Ungültige Discord-ID', message: 'Die Discord-ID muss 17–22 Ziffern haben (Snowflake).' })
      return
    }

    try {
      const payload = {
        ...form,
        discordId: did || null,
        applicationId: form.applicationId || null,
        contractTemplateId: form.contractTemplateId || null,
      }
      await execute('/api/officers', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      addToast({
        type: 'success',
        title: 'Officer erstellt',
        message: 'Der Arbeitsvertrag wurde zur Unterschrift verschickt.',
      })
      router.push('/officers')
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    }
  }

  const update = (key: string, value: string | string[]) => setForm(prev => ({ ...prev, [key]: value }))

  /**
   * Bewerbung auswählen: übernimmt Name und Discord-ID aus der Bewerbung, aber
   * nur in noch leere Felder — bereits eingetippte Angaben bleiben erhalten.
   */
  const selectApplication = (applicationId: string) => {
    const application = applications?.find((item) => item.id === applicationId)
    setForm((prev) => {
      if (!application) return { ...prev, applicationId }
      const { firstName, lastName } = splitApplicantName(application.applicantDisplayName)
      return {
        ...prev,
        applicationId,
        firstName: prev.firstName || firstName,
        lastName: prev.lastName || lastName,
        discordId: prev.discordId || application.discordId,
      }
    })
  }

  if (!canCreate) return <UnauthorizedContent />

  return (
    <div>
      <PageHeader
        title="Neuer Officer"
        description="Neuen Mitarbeiter anlegen"
        action={
          <Link href="/officers">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={15} strokeWidth={1.75} />
              Zurück
            </Button>
          </Link>
        }
      />

      <div className="glass-panel-elevated rounded-[14px] p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {(applications?.length ?? 0) > 0 && (
            <div className="rounded-[12px] border border-[#18385f]/55 bg-[#0a1a33]/40 p-3.5">
              <Select
                id="applicationId"
                label="Zugehörige Bewerbung"
                value={form.applicationId}
                onValueChange={selectApplication}
                options={(applications ?? []).map((application) => ({
                  value: application.id,
                  label: `${application.applicantDisplayName} · ${formatApplicationDate(application.submittedAt)}`,
                }))}
                placeholder="Keine Bewerbung verknüpfen"
              />
              <p className="mt-1.5 text-[11.5px] text-[#8ea4bd]">
                Verknüpft die Personalakte mit der Bewerbung. Name und Discord-ID werden – sofern
                noch leer – automatisch übernommen.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="firstName"
              label="Vorname"
              value={form.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              required
            />
            <Input
              id="lastName"
              label="Nachname"
              value={form.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="badgeNumber"
              label="Dienstnummer"
              value={form.badgeNumber}
              onChange={(e) => update('badgeNumber', e.target.value)}
              placeholder="Automatisch nach Rang"
            />
            <Select
              id="rankId"
              label="Rang"
              value={form.rankId}
              onChange={(e) => update('rankId', e.target.value)}
              options={ranks?.map(r => ({ value: r.id, label: r.name })) || []}
              placeholder="Rang auswählen"
              required
            />
          </div>

          <div className="max-w-xl">
            <Input
              id="discordId"
              label="Discord-ID"
              value={form.discordId}
              onChange={(e) => update('discordId', e.target.value)}
              placeholder="Optional (Snowflake)"
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DateField
              id="hireDate"
              label="Einstellungsdatum"
              value={form.hireDate}
              onChange={(v) => update('hireDate', v)}
            />
            <UnitMultiSelect value={form.units} units={units ?? undefined} onChange={(value) => update('units', value)} />
          </div>

          <Textarea
            id="notes"
            label="Notizen"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            placeholder="Optional"
          />

          <div className="rounded-[12px] border border-[#4a3a12]/45 bg-[#302712]/30 p-3.5">
            <div className="flex items-start gap-2.5">
              <FileSignature size={16} className="mt-0.5 shrink-0 text-[#d4af37]" />
              <div>
                <p className="text-[13px] font-semibold text-white">
                  Arbeitsvertrag wird automatisch versendet
                </p>
                <p className="mt-1 text-[11.5px] leading-5 text-[#d8c68c]">
                  Der Officer bekommt seinen persönlichen Vertragslink als Discord-DM; ist keine DM
                  möglich, wird die Aufforderung im Vertrags-Channel gepostet.{' '}
                  <strong className="font-semibold text-[#f0dfa8]">
                    Die Einstellung gilt erst als abgeschlossen, wenn der Vertrag unterschrieben ist.
                  </strong>
                </p>
              </div>
            </div>
            {(contractTemplates?.length ?? 0) > 1 && (
              <div className="mt-3">
                <Select
                  id="contractTemplateId"
                  label="Vertragsvorlage"
                  value={form.contractTemplateId}
                  onValueChange={(value) => update('contractTemplateId', value)}
                  options={(contractTemplates ?? []).map((template) => ({
                    value: template.id,
                    label: template.isDefault ? `${template.name} (Standard)` : template.name,
                  }))}
                  placeholder="Standardvorlage verwenden"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Link href="/officers">
              <Button type="button" variant="secondary" size="sm">Abbrechen</Button>
            </Link>
            <Button type="submit" size="sm" loading={loading}>
              Officer erstellen
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
