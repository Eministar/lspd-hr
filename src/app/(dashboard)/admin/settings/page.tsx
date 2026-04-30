'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Save, ShieldCheck } from 'lucide-react'
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
    employeeRoleIds: [],
    commandRoleIds: [],
    rankRoleMap: {},
    trainingRoleMap: {},
    unitRoleMap: {},
  })

  useEffect(() => {
    if (settings) {
      setOrgName(settings['orgName'] || 'LSPD')
      setBadgePrefix(settings['badgePrefix'] || '')
    }
  }, [settings])

  useEffect(() => {
    if (discordData) setDiscordForm(discordData.config)
  }, [discordData])

  const saveSetting = async (key: string, value: string) => {
    try {
      await execute('/api/settings', { method: 'POST', body: JSON.stringify({ key, value }) })
      addToast({ type: 'success', title: 'Einstellung gespeichert' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const saveDiscordConfig = async () => {
    try {
      await execute('/api/discord/config', { method: 'POST', body: JSON.stringify(discordForm) })
      addToast({ type: 'success', title: 'Discord-Konfiguration gespeichert' })
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

  const toggleRole = (field: 'employeeRoleIds' | 'commandRoleIds', roleId: string, checked: boolean) => {
    setDiscordForm((prev) => ({
      ...prev,
      [field]: checked
        ? Array.from(new Set([...prev[field], roleId]))
        : prev[field].filter((id) => id !== roleId),
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
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={refetchDiscord}><RefreshCw size={13} /> Neu laden</Button>
              <Button variant="secondary" size="sm" onClick={registerCommands}><ShieldCheck size={13} /> Commands</Button>
              <Button size="sm" onClick={saveDiscordConfig}><Save size={13} /> Speichern</Button>
            </div>
          </div>

          {!discordData?.botConfigured && (
            <div className="mb-4 rounded-[10px] border border-[#3d2d12] bg-[#1d1608] px-3 py-2 text-[12px] text-[#e8c979]">
              DISCORD_BOT_TOKEN ist nicht gesetzt. Die Oberfläche kann gespeichert werden, Discord-Rollen und Channel werden aber erst mit Bot-Token geladen.
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
            <div>
              <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-2">Feste Mitarbeiterrollen</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {discordData?.roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 rounded-[8px] bg-[#0a1a33]/40 border border-[#18385f]/50 px-3 py-2 text-[12.5px] text-[#edf4fb]">
                    <input
                      type="checkbox"
                      checked={discordForm.employeeRoleIds.includes(role.id)}
                      onChange={(e) => toggleRole('employeeRoleIds', role.id, e.target.checked)}
                    />
                    <span className="truncate">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-2">Rollen, die Discord-Commands ausführen dürfen</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {discordData?.roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 rounded-[8px] bg-[#0a1a33]/40 border border-[#18385f]/50 px-3 py-2 text-[12.5px] text-[#edf4fb]">
                    <input
                      type="checkbox"
                      checked={discordForm.commandRoleIds.includes(role.id)}
                      onChange={(e) => toggleRole('commandRoleIds', role.id, e.target.checked)}
                    />
                    <span className="truncate">{role.name}</span>
                  </label>
                ))}
              </div>
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
