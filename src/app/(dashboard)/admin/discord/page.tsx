'use client'

import { useState, useMemo } from 'react'
import { Save, Bot, KeyRound, Hash, Activity, RefreshCw, ShieldCheck, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'

interface Rank { id: string; name: string; color: string; sortOrder: number; discordRoleId: string | null }
interface Training { id: string; key: string; label: string; sortOrder: number; discordRoleId: string | null }

const SETTING_KEYS = [
  'discordBotApiKey',
  'discordBotPublicUrl',
  'discordGuildId',
  'discordPromotionChannelId',
  'discordTrainingChannelId',
  'discordHrLogChannelId',
  'discordTerminationChannelId',
  'discordOrgIconUrl',
] as const

type SettingKey = (typeof SETTING_KEYS)[number]

const FIELDS: { key: SettingKey; label: string; placeholder: string; help?: string }[] = [
  { key: 'discordBotApiKey', label: 'Bot API Key', placeholder: 'langer zufälliger String', help: 'Geheimer Schlüssel, den der Discord-Bot beim Aufruf der HR-API mitsendet (Bearer Token).' },
  { key: 'discordBotPublicUrl', label: 'Bot URL (HTTP-Endpunkt)', placeholder: 'https://bot.example.com', help: 'Die HR-App schickt Events (Beförderung, Ausbildung) an <Bot URL>/events.' },
  { key: 'discordGuildId', label: 'Discord Guild (Server) ID', placeholder: '1234567890123456789' },
  { key: 'discordPromotionChannelId', label: 'Channel: Beförderungen', placeholder: '1234567890123456789' },
  { key: 'discordTrainingChannelId', label: 'Channel: Ausbildungen', placeholder: '1234567890123456789' },
  { key: 'discordTerminationChannelId', label: 'Channel: Kündigungen', placeholder: '1234567890123456789' },
  { key: 'discordHrLogChannelId', label: 'Channel: HR-Log (Audit)', placeholder: '1234567890123456789' },
  { key: 'discordOrgIconUrl', label: 'Embed-Icon URL (optional)', placeholder: 'https://example.com/shield.webp' },
]

export default function DiscordAdminPage() {
  const { data: settings, loading: settingsLoading, refetch: refetchSettings } = useFetch<Record<string, string>>('/api/settings')
  const { data: ranks, loading: ranksLoading } = useFetch<Rank[]>('/api/ranks')
  const { data: trainings, loading: trainingsLoading } = useFetch<Training[]>('/api/trainings')
  const { execute } = useApi()
  const { addToast } = useToast()

  // Local "dirty" overrides; falls back to the freshly-fetched `settings` for
  // any key the user has not touched yet. This avoids cascading effect renders.
  const [overrides, setOverrides] = useState<Partial<Record<SettingKey, string>>>({})
  const [saving, setSaving] = useState<SettingKey | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  const values: Record<SettingKey, string> = useMemo(() => {
    const v = {} as Record<SettingKey, string>
    for (const k of SETTING_KEYS) v[k] = overrides[k] ?? settings?.[k] ?? ''
    return v
  }, [overrides, settings])

  const setValue = (k: SettingKey, value: string) => setOverrides((o) => ({ ...o, [k]: value }))

  const saveOne = async (key: SettingKey) => {
    setSaving(key)
    try {
      await execute('/api/settings', { method: 'POST', body: JSON.stringify({ key, value: values[key] }) })
      addToast({ type: 'success', title: 'Gespeichert' })
      setOverrides((o) => {
        const { [key]: _drop, ...rest } = o
        return rest
      })
      await refetchSettings()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    } finally {
      setSaving(null)
    }
  }

  const saveAll = async () => {
    setSavingAll(true)
    try {
      for (const k of SETTING_KEYS) {
        await execute('/api/settings', { method: 'POST', body: JSON.stringify({ key: k, value: values[k] }) })
      }
      addToast({ type: 'success', title: 'Alle Werte gespeichert' })
      setOverrides({})
      await refetchSettings()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    } finally {
      setSavingAll(false)
    }
  }

  const generateApiKey = () => {
    const arr = new Uint8Array(32)
    crypto.getRandomValues(arr)
    const key = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
    setValue('discordBotApiKey', key)
  }

  const mappedRanks = useMemo(
    () => (ranks || []).filter((r) => !!r.discordRoleId),
    [ranks]
  )
  const unmappedRanks = useMemo(
    () => (ranks || []).filter((r) => !r.discordRoleId),
    [ranks]
  )
  const mappedTrainings = useMemo(
    () => (trainings || []).filter((t) => !!t.discordRoleId),
    [trainings]
  )
  const unmappedTrainings = useMemo(
    () => (trainings || []).filter((t) => !t.discordRoleId),
    [trainings]
  )

  if (settingsLoading || ranksLoading || trainingsLoading) return <PageLoader />

  const isConfigured = Boolean(values.discordBotApiKey && values.discordBotPublicUrl && values.discordGuildId)

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title="Discord-Bot"
        description="Bot-Verbindung, Channels und Rollen-Mapping verwalten"
        action={
          <Button size="sm" onClick={saveAll} disabled={savingAll}>
            <Save size={13} /> Alle speichern
          </Button>
        }
      />

      <div className={`glass-panel-elevated rounded-[14px] p-5 border ${isConfigured ? 'border-[#34d399]/30' : 'border-[#fbbf24]/30'}`}>
        <div className="flex items-start gap-4">
          <div className={`h-10 w-10 rounded-[10px] flex items-center justify-center shrink-0 ${isConfigured ? 'bg-[#0d2e21] text-[#34d399]' : 'bg-[#2a200a] text-[#fbbf24]'}`}>
            <Bot size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-[#eee]">
              Status: {isConfigured ? 'konfiguriert' : 'noch nicht vollständig'}
            </h3>
            <p className="text-[12px] text-[#8ea4bd] mt-1 leading-snug">
              {isConfigured
                ? 'API-Key, Bot-URL und Guild-ID sind gesetzt. Die HR-App sendet jetzt Events an den Bot.'
                : 'Trage zuerst Bot API Key, Bot URL und Guild ID ein, damit Events ausgeliefert werden.'}
            </p>
          </div>
          <div className="flex flex-col gap-1 text-right shrink-0">
            <span className="text-[10px] text-[#4a6585] uppercase tracking-wider">Mapped</span>
            <span className="text-[12px] text-[#9fb0c4]">
              <ShieldCheck size={11} className="inline -mt-0.5" /> {mappedRanks.length}/{ranks?.length ?? 0} Ränge
            </span>
            <span className="text-[12px] text-[#9fb0c4]">
              <Activity size={11} className="inline -mt-0.5" /> {mappedTrainings.length}/{trainings?.length ?? 0} Ausbildungen
            </span>
          </div>
        </div>
      </div>

      <div className="glass-panel-elevated rounded-[14px] p-5">
        <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-[#eee] mb-1">
          <KeyRound size={14} className="text-[#d4af37]" />
          Verbindung
        </h3>
        <p className="text-[11.5px] text-[#6b8299] mb-4">
          Diese Einstellungen werden auch auf der Bot-Seite als <code className="text-[#d4af37]">BACKEND_URL</code> /{' '}
          <code className="text-[#d4af37]">BACKEND_API_KEY</code> benötigt.
        </p>

        <div className="space-y-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label={f.label}
                    value={values[f.key]}
                    type={f.key === 'discordBotApiKey' ? 'password' : 'text'}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    placeholder={f.placeholder}
                  />
                </div>
                {f.key === 'discordBotApiKey' && (
                  <Button variant="secondary" size="sm" onClick={generateApiKey} title="Zufälligen Key erzeugen">
                    <RefreshCw size={13} />
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => saveOne(f.key)} disabled={saving === f.key}>
                  <Save size={13} />
                </Button>
              </div>
              {f.help && <p className="text-[11px] text-[#6b8299] pl-1">{f.help}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel-elevated rounded-[14px] p-5">
          <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-[#eee] mb-3">
            <Hash size={14} className="text-[#5865F2]" />
            Rollen-Mapping: Ränge
          </h3>
          <ul className="space-y-1.5">
            {mappedRanks.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="text-[#cdd9e8]">{r.name}</span>
                <span className="ml-auto text-[10.5px] font-mono text-[#7c8ad9]">{r.discordRoleId}</span>
              </li>
            ))}
            {mappedRanks.length === 0 && (
              <li className="text-[11.5px] text-[#6b8299] italic">Noch keine Ränge gemappt.</li>
            )}
          </ul>
          {unmappedRanks.length > 0 && (
            <p className="text-[11px] text-[#6b8299] mt-3">
              Noch unzugeordnet: <span className="text-[#9fb0c4]">{unmappedRanks.map((r) => r.name).join(', ')}</span>
            </p>
          )}
          <a
            href="/admin/ranks"
            className="inline-flex items-center gap-1 text-[11px] text-[#d4af37] hover:underline mt-3"
          >
            Ränge verwalten <ExternalLink size={10} />
          </a>
        </div>

        <div className="glass-panel-elevated rounded-[14px] p-5">
          <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-[#eee] mb-3">
            <Hash size={14} className="text-[#5865F2]" />
            Rollen-Mapping: Ausbildungen
          </h3>
          <ul className="space-y-1.5">
            {mappedTrainings.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="text-[#cdd9e8]">{t.label}</span>
                <span className="text-[#4a6585] font-mono text-[10.5px]">({t.key})</span>
                <span className="ml-auto text-[10.5px] font-mono text-[#7c8ad9]">{t.discordRoleId}</span>
              </li>
            ))}
            {mappedTrainings.length === 0 && (
              <li className="text-[11.5px] text-[#6b8299] italic">Noch keine Ausbildungen gemappt.</li>
            )}
          </ul>
          {unmappedTrainings.length > 0 && (
            <p className="text-[11px] text-[#6b8299] mt-3">
              Noch unzugeordnet: <span className="text-[#9fb0c4]">{unmappedTrainings.map((t) => t.label).join(', ')}</span>
            </p>
          )}
          <a
            href="/admin/trainings"
            className="inline-flex items-center gap-1 text-[11px] text-[#d4af37] hover:underline mt-3"
          >
            Ausbildungen verwalten <ExternalLink size={10} />
          </a>
        </div>
      </div>

      <div className="glass-panel-elevated rounded-[14px] p-5">
        <h3 className="text-[13.5px] font-semibold text-[#eee] mb-2">Slash-Commands (Übersicht)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
          <CommandRow cmd="/officer info <user|badge>" desc="Officer-Profil als Embed anzeigen" />
          <CommandRow cmd="/officer sync <user>" desc="Discord-Rollen für diesen Officer neu setzen" />
          <CommandRow cmd="/officer search <text>" desc="Officer suchen (Name, Dienstnummer, Discord-ID)" />
          <CommandRow cmd="/training list" desc="Alle Ausbildungen + Rollen-Mapping" />
          <CommandRow cmd="/training set <officer> <key> <true|false>" desc="Ausbildung markieren (HR)" />
          <CommandRow cmd="/rank list" desc="Alle Ränge + Rollen-Mapping" />
          <CommandRow cmd="/sync all" desc="Alle Officer-Rollen neu setzen (Admin)" />
          <CommandRow cmd="/help" desc="Diese Übersicht im Discord anzeigen" />
        </div>
      </div>
    </div>
  )
}

function CommandRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-[8px] bg-[#0a1a33]/60 border border-[#18385f]/60">
      <code className="text-[11.5px] text-[#d4af37] font-mono shrink-0">{cmd}</code>
      <span className="text-[#9fb0c4]">{desc}</span>
    </div>
  )
}
