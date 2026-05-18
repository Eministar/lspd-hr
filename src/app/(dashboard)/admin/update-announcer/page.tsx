'use client'

import { useState } from 'react'
import { Megaphone, RefreshCw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/layout/page-header'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'

const emptyUpdateForm = {
  title: '',
  version: '',
  added: '',
  changed: '',
  removed: '',
  note: '',
}

export default function UpdateAnnouncerPage() {
  const { user } = useAuth()
  const { execute } = useApi()
  const { addToast } = useToast()
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState(emptyUpdateForm)

  if (!hasPermission(user, 'updates:send')) return <UnauthorizedContent />

  const sendUpdateAnnouncement = async () => {
    setSending(true)
    try {
      await execute('/api/discord/update-announcement', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      addToast({ type: 'success', title: 'Update gesendet' })
      setForm(emptyUpdateForm)
    } catch (err) {
      addToast({ type: 'error', title: 'Update konnte nicht gesendet werden', message: err instanceof Error ? err.message : '' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <PageHeader title="Update senden" description="Changelog-Embed im Discord Update-Channel veröffentlichen" />

      <div className="max-w-4xl">
        <div className="glass-panel-elevated rounded-[14px] p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[13.5px] font-semibold text-[#eee]">Update-Announcer</h3>
              <p className="text-[11.5px] text-[#6b8299] mt-1">
                Die Einträge werden als Discord-diff-Blöcke für Neu, Geändert und Entfernt gesendet.
              </p>
            </div>
            <Megaphone size={18} className="text-[#d4af37] shrink-0" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
            <Input
              label="Titel"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="z.B. LSPD HR Tools Update"
            />
            <Input
              label="Version"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              placeholder="z.B. 1.4.0"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
            <Textarea
              label="Neu"
              value={form.added}
              onChange={(e) => setForm({ ...form, added: e.target.value })}
              placeholder="Eine Änderung pro Zeile"
              rows={8}
            />
            <Textarea
              label="Geändert"
              value={form.changed}
              onChange={(e) => setForm({ ...form, changed: e.target.value })}
              placeholder="Eine Änderung pro Zeile"
              rows={8}
            />
            <Textarea
              label="Entfernt"
              value={form.removed}
              onChange={(e) => setForm({ ...form, removed: e.target.value })}
              placeholder="Eine Änderung pro Zeile"
              rows={8}
            />
          </div>

          <div className="mt-3">
            <Textarea
              label="Notiz"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Optionaler Text über dem Changelog"
              rows={4}
            />
          </div>

          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={sendUpdateAnnouncement} disabled={sending}>
              {sending ? <><RefreshCw size={13} className="animate-spin" /> Sende…</> : <><Send size={13} /> Update senden</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
