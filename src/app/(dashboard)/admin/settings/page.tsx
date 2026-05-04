'use client'

import { useState, useEffect, useRef } from 'react'
import { Clock, RefreshCw, Save, ShieldCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'

interface DiscordRole {
  id: string
  name: string
}

interface DiscordChannel {
  id: string
  name?: string
}

interface DiscordRank {
  id: string
  name: string
}

interface DiscordTraining {
  id: string
  label: string
}

interface DiscordUnit {
  key: string
  name: string
}

interface DiscordConfigResponse {
  botConfigured: boolean
  config: {
    guildId: string
    applicationId: string
    announcementsChannelId: string
    dutyStatusChannelId: string
    dutyAdminLogChannelId: string
    dutyStatusMessageId: string
    employeeRoleIds: string[]
    commandRoleIds: string[]
    rankRoleMap: Record<string, string>
    trainingRoleMap: Record<string, string>
    unitRoleMap: Record<string, string>
  }
  roles: DiscordRole[]
  channels: DiscordChannel[]
  ranks: DiscordRank[]
  trainings: DiscordTraining[]
  units: DiscordUnit[]
  diagnostics: {
    guildConfigured: boolean
    applicationConfigured: boolean
    announcementsChannelConfigured: boolean
    dutyAdminLogConfigured: boolean
    rolesError: string | null
    channelsError: string | null
  }
}

export default function SettingsPage() {
  const { data: settings, loading, refetch } = useFetch<Record<string, string>>('/api/settings')
  const { data: discordData, loading: discordLoading, refetch: refetchDiscord } = useFetch<DiscordConfigResponse>('/api/discord/config')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [orgName, setOrgName] = useState('LSPD')
  const [badgePrefix, setBadgePrefix] = useState('')
  const [discordForm, setDiscordForm] = useState<DiscordConfigResponse['config']>({
    guildId: '',
    applicationId: '',
    announcementsChannelId: '',
    dutyStatusChannelId: '',
    dutyAdminLogChannelId: '',
    dutyStatusMessageId: '',
    employeeRoleIds: [],
    commandRoleIds: [],
    rankRoleMap: {},
    trainingRoleMap: {},
    unitRoleMap: {},
  })

  const settingsInitialized = useRef(false)
  const discordInitialized = useRef(false)

  useEffect(() => {
    if (settings && !settingsInitialized.current) {
      settingsInitialized.current = true
      setOrgName(settings['orgName'] || 'LSPD')
      setBadgePrefix(settings['badgePrefix'] || '')
    }
  }, [settings])

  useEffect(() => {
    if (discordData && !discordInitialized.current) {
      discordInitialized.current = true
      setDiscordForm(discordData.config)
    }
  }, [discordData])

  const saveSetting = async (key: string, value: string) => {
    try {
      await execute('/api/settings', { method: 'POST', body: JSON.stringify({ key, value }) })
      addToast({ type: 'success', title: 'Einstellung gespeichert' })
      settingsInitialized.current = false
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const saveDiscordConfig = async () => {
    try {
      await execute('/api/discord/config', { method: 'POST', body: JSON.stringify(discordForm) })
      addToast({ type: 'success', title: 'Discord-Konfiguration gespeichert' })
      discordInitialized.current = false
      await refetchDiscord()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const registerCommands = async () => {
    try {
      await execute('/api/discord/register-commands', { method: 'POST' })
      addToast({ type: 'success', title: 'Discord-Commands registriert' })
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const publishDutyEmbed = async () => {
    try {
      await execute('/api/duty-times/discord-message', { method: 'POST' })
      addToast({ type: 'success', title: 'Dienstzeiten-Embed aktualisiert' })
      discordInitialized.current = false
      await refetchDiscord()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const [fullSyncLoading, setFullSyncLoading] = useState(false)

  const fullSync = async () => {
    setFullSyncLoading(true)
    try {
      const res = await execute('/api/discord/full-sync', { method: 'POST' }) as { synced: number; skipped: number; failed: number; total: number; message: string }
      addToast({
        type: res.failed > 0 ? 'warning' : 'success',
        title: 'Discord Full-Sync abgeschlossen',
        message: res.message,
      })
    } catch (err) {
      addToast({ type: 'error', title: 'Full-Sync fehlgeschlagen', message: err instanceof Error ? err.message : '' })
    } finally {
      setFullSyncLoading(false)
    }
  }

  const addRole = (field: 'employeeRoleIds' | 'commandRoleIds', roleId: string) => {
    if (!roleId) return
    setDiscordForm((prev) => ({
      ...prev,
      [field]: Array.from(new Set([...prev[field], roleId])),
    }))
  }

  const removeRole = (field: 'employeeRoleIds' | 'commandRoleIds', roleId: string) => {
    setDiscordForm((prev) => ({
      ...prev,
      [field]: prev[field].filter((id) => id !== roleId),
    }))
  }

  const setRoleMap = (field: 'rankRoleMap' | 'trainingRoleMap' | 'unitRoleMap', key: string, roleId: string) => {
    setDiscordForm((prev) => {
      const next = { ...prev[field] }
      if (roleId) next[key] = roleId
      else delete next[key]
      return { ...prev, [field]: next }
    })
  }

  if (loading || discordLoading) return <PageLoader />

  const roleOptions = [
    { value: '', label: 'Keine Rolle' },
    ...(discordData?.roles.map((role) => ({ value: role.id, label: role.name })) || []),
  ]
  const channelOptions = [
    { value: '', label: 'Kein Channel' },
    ...(discordData?.channels.map((channel) => ({ value: channel.id, label: `#${channel.name || channel.id}` })) || []),
  ]
  const roleName = (roleId: string) => discordData?.roles.find((role) => role.id === roleId)?.name || roleId

  const renderRolePicker = (field: 'employeeRoleIds' | 'commandRoleIds') => {
    const selected = discordForm[field]
    const options = [
      { value: '', label: 'Rolle hinzufügen' },
      ...(discordData?.roles
        .filter((role) => !selected.includes(role.id))
        .map((role) => ({ value: role.id, label: role.name })) || []),
    ]

    return (
      <div className="space-y-2">
        <Select
          value=""
          onValueChange={(roleId) => addRole(field, roleId)}
          options={options}
          size="sm"
        />
        <div className="flex flex-wrap gap-2 min-h-[34px]">
          {selected.map((roleId) => (
            <button
              key={roleId}
              type="button"
              onClick={() => removeRole(field, roleId)}
              className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#234568] bg-[#0a1a33]/70 px-2.5 py-1.5 text-[12px] text-[#edf4fb] hover:border-[#d4af37]/50"
              title="Rolle entfernen"
            >
              {roleName(roleId)}
              <span className="text-[#6b8299]">×</span>
            </button>
          ))}
          {selected.length === 0 && (
            <span className="text-[12px] text-[#4a6585] py-1.5">Keine Rollen ausgewählt</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Einstellungen" description="Systemweite Konfiguration" />

      <div className="space-y-4 max-w-4xl">
        <div className="glass-panel-elevated rounded-[14px] p-5">
          <h3 className="text-[13.5px] font-semibold text-[#eee] mb-4">Allgemein</h3>
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input label="Organisationsname" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
              <Button variant="secondary" size="sm" onClick={() => saveSetting('orgName', orgName)}><Save size={13} /></Button>
            </div>
          </div>
        </div>

        <div className="glass-panel-elevated rounded-[14px] p-5">
          <h3 className="text-[13.5px] font-semibold text-[#eee] mb-4">Dienstnummern</h3>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input label="Dienstnummer-Prefix" value={badgePrefix} onChange={(e) => setBadgePrefix(e.target.value)} placeholder="z.B. LSPD-" />
            </div>
            <Button variant="secondary" size="sm" onClick={() => saveSetting('badgePrefix', badgePrefix)}><Save size={13} /></Button>
          </div>
        </div>

        <div className="glass-panel-elevated rounded-[14px] p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[13.5px] font-semibold text-[#eee]">Discord Integration</h3>
              <p className="text-[11.5px] text-[#6b8299] mt-1">
                Bot-Token wird über die Umgebung gesetzt. Rollen, Channel und Command-Rechte werden hier gepflegt.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" size="sm" onClick={fullSync} disabled={fullSyncLoading}>
                {fullSyncLoading ? <><RefreshCw size={13} className="animate-spin" /> Synchronisiere…</> : <><Users size={13} /> Alles synchronisieren</>}
              </Button>
              <Button variant="secondary" size="sm" onClick={refetchDiscord}><RefreshCw size={13} /> Neu laden</Button>
              <Button variant="secondary" size="sm" onClick={registerCommands}><ShieldCheck size={13} /> Commands</Button>
              <Button variant="secondary" size="sm" onClick={publishDutyEmbed}><Clock size={13} /> Dienstzeiten</Button>
              <Button size="sm" onClick={saveDiscordConfig}><Save size={13} /> Speichern</Button>
            </div>
          </div>

          {!discordData?.botConfigured && (
            <div className="mb-4 rounded-[10px] border border-[#3d2d12] bg-[#1d1608] px-3 py-2 text-[12px] text-[#e8c979]">
              DISCORD_BOT_TOKEN ist nicht gesetzt. Die Oberfläche kann gespeichert werden, Discord-Rollen und Channel werden aber erst mit Bot-Token geladen.
            </div>
          )}
          {discordData && !discordData.diagnostics.guildConfigured && (
            <div className="mb-4 rounded-[10px] border border-[#3d2d12] bg-[#1d1608] px-3 py-2 text-[12px] text-[#e8c979]">
              Guild-ID fehlt. Setze sie hier oder über DISCORD_GUILD_ID, sonst können Rollen und Commands nicht geladen werden.
            </div>
          )}
          {discordData?.diagnostics.rolesError && (
            <div className="mb-4 rounded-[10px] border border-[#3b1616] bg-[#1c1111] px-3 py-2 text-[12px] text-[#fca5a5]">
              Rollen konnten nicht geladen werden: {discordData.diagnostics.rolesError}
            </div>
          )}
          {discordData?.diagnostics.channelsError && (
            <div className="mb-4 rounded-[10px] border border-[#3b1616] bg-[#1c1111] px-3 py-2 text-[12px] text-[#fca5a5]">
              Channel konnten nicht geladen werden: {discordData.diagnostics.channelsError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Guild-ID"
              value={discordForm.guildId}
              onChange={(e) => setDiscordForm({ ...discordForm, guildId: e.target.value })}
              placeholder="Discord Server-ID"
            />
            <Input
              label="Application-ID"
              value={discordForm.applicationId}
              onChange={(e) => setDiscordForm({ ...discordForm, applicationId: e.target.value })}
              placeholder="Discord App-ID"
            />
            <div className="sm:col-span-2">
              <Select
                label="Ankündigungs-Channel"
                value={discordForm.announcementsChannelId}
                onValueChange={(announcementsChannelId) => setDiscordForm({ ...discordForm, announcementsChannelId })}
                options={channelOptions}
              />
            </div>
            <div className="sm:col-span-2">
              <Select
                label="Dienstzeiten-Channel"
                value={discordForm.dutyStatusChannelId}
                onValueChange={(dutyStatusChannelId) => setDiscordForm({ ...discordForm, dutyStatusChannelId })}
                options={channelOptions}
              />
              <p className="text-[11px] text-[#5c728a] mt-1.5">
                Öffentliches Panel mit Buttons; zeigt, wer eingestempelt ist (wird fortlaufend aktualisiert).
              </p>
            </div>
            <div className="sm:col-span-2">
              <Select
                label="Dienstzeit-Protokoll (Admin)"
                value={discordForm.dutyAdminLogChannelId}
                onValueChange={(dutyAdminLogChannelId) => setDiscordForm({ ...discordForm, dutyAdminLogChannelId })}
                options={channelOptions}
              />
              <p className="text-[11px] text-[#5c728a] mt-1.5">
                Hier erscheinen die Protokoll-Einträge zu Ein- und Ausstempeln. Leer lassen, um den Ankündigungs-Channel zu nutzen.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
            <div>
              <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-2">Feste Mitarbeiterrollen</p>
              {renderRolePicker('employeeRoleIds')}
            </div>
            <div>
              <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-2">Rollen, die Discord-Commands ausführen dürfen</p>
              {renderRolePicker('commandRoleIds')}
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-2">Rangrollen</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {discordData?.ranks.map((rank) => (
                  <Select
                    key={rank.id}
                    label={rank.name}
                    value={discordForm.rankRoleMap[rank.id] || ''}
                    onValueChange={(roleId) => setRoleMap('rankRoleMap', rank.id, roleId)}
                    options={roleOptions}
                    size="sm"
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-2">Ausbildungsrollen</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {discordData?.trainings.map((training) => (
                  <Select
                    key={training.id}
                    label={training.label}
                    value={discordForm.trainingRoleMap[training.id] || ''}
                    onValueChange={(roleId) => setRoleMap('trainingRoleMap', training.id, roleId)}
                    options={roleOptions}
                    size="sm"
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-2">Unit-Rollen</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {discordData?.units.map((unit) => (
                  <Select
                    key={unit.key}
                    label={unit.name}
                    value={discordForm.unitRoleMap[unit.key] || ''}
                    onValueChange={(roleId) => setRoleMap('unitRoleMap', unit.key, roleId)}
                    options={roleOptions}
                    size="sm"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
