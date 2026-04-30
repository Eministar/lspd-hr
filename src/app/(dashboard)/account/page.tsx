'use client'

import { useEffect, useState } from 'react'
import { KeyRound, MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'

export default function AccountPage() {
  const { user, refreshUser: refreshCurrentUser } = useAuth()
  const { execute, loading } = useApi()
  const { addToast } = useToast()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [discordId, setDiscordId] = useState(user?.discordId ?? '')
  const canChangePassword = hasPermission(user, 'password:change')

  useEffect(() => {
    setDiscordId(user?.discordId ?? '')
  }, [user?.discordId])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      addToast({ type: 'error', title: 'Fehler', message: 'Die neuen Passwörter stimmen nicht überein' })
      return
    }

    try {
      await execute('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      addToast({ type: 'success', title: 'Passwort geändert' })
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const saveDiscordId = async () => {
    try {
      await execute('/api/auth/discord', {
        method: 'PATCH',
        body: JSON.stringify({ discordId }),
      })
      await refreshCurrentUser()
      addToast({ type: 'success', title: 'Discord-Konto gespeichert' })
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  return (
    <div>
      <PageHeader
        title="Mein Konto"
        description={user?.displayName ?? 'Benutzereinstellungen'}
      />

      <div className="space-y-4 max-w-xl">
      <div className="glass-panel-elevated rounded-[14px] p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-9 w-9 rounded-[9px] bg-[#0f2340] flex items-center justify-center text-[#d4af37]">
            <MessageCircle size={17} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-[13.5px] font-semibold text-[#eee]">Discord-Konto</h3>
            <p className="text-[11.5px] text-[#6b8299] mt-0.5">Wird für Pings in HR-Meldungen genutzt.</p>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Discord-ID"
              value={discordId}
              onChange={(e) => setDiscordId(e.target.value)}
              placeholder="17–22 Ziffern"
            />
          </div>
          <Button size="sm" onClick={saveDiscordId} loading={loading}>Speichern</Button>
        </div>
      </div>

      <div className="glass-panel-elevated rounded-[14px] p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-9 w-9 rounded-[9px] bg-[#0f2340] flex items-center justify-center text-[#d4af37]">
            <KeyRound size={17} strokeWidth={1.75} />
          </div>
          <h3 className="text-[13.5px] font-semibold text-[#eee]">Passwort ändern</h3>
        </div>

        {canChangePassword ? (
          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Aktuelles Passwort"
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              required
            />
            <Input
              label="Neues Passwort"
              type="password"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              required
            />
            <Input
              label="Neues Passwort wiederholen"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              required
            />
            <div className="flex justify-end pt-1">
              <Button size="sm" loading={loading} disabled={!form.currentPassword || !form.newPassword || !form.confirmPassword}>
                Speichern
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-[13px] text-[#8ea4bd]">
            Für dieses Konto ist die Passwortänderung nicht freigegeben.
          </p>
        )}
      </div>
      </div>
    </div>
  )
}
