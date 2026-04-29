'use client'

import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'

export default function SettingsPage() {
  const { data: settings, loading, refetch } = useFetch<Record<string, string>>('/api/settings')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [orgName, setOrgName] = useState('LSPD')
  const [badgePrefix, setBadgePrefix] = useState('')

  useEffect(() => {
    if (settings) {
      setOrgName(settings['orgName'] || 'LSPD')
      setBadgePrefix(settings['badgePrefix'] || '')
    }
  }, [settings])

  const saveSetting = async (key: string, value: string) => {
    try {
      await execute('/api/settings', { method: 'POST', body: JSON.stringify({ key, value }) })
      addToast({ type: 'success', title: 'Einstellung gespeichert' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader title="Einstellungen" description="Systemweite Konfiguration" />

      <div className="space-y-4 max-w-2xl">
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
      </div>
    </div>
  )
}
