'use client'

import { useState } from 'react'
import { CircleSlash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { isSuspended } from '@/lib/suspension'
import { formatDateTime } from '@/lib/utils'

export function SuspensionControl({ officer, canEdit, onChange }: {
  officer: { id: string; status: string; suspendedUntil?: string | null; suspensionReason?: string | null }
  canEdit: boolean
  onChange: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState('1')
  const [unit, setUnit] = useState('24')
  const [reason, setReason] = useState('')
  const { execute, loading } = useApi()
  const { addToast } = useToast()
  const active = isSuspended(officer)
  const hours = Number(duration) * Number(unit)
  const valid = Number.isInteger(Number(duration)) && Number(duration) > 0 && hours <= 8760

  async function save(remove = false) {
    try {
      await execute(`/api/officers/${officer.id}/suspension`, {
        method: remove ? 'DELETE' : 'POST',
        ...(remove ? {} : { body: JSON.stringify({ durationHours: hours, reason }) }),
      })
      setOpen(false)
      addToast({ type: 'success', title: remove ? 'Suspendierung aufgehoben' : 'Officer suspendiert' })
      await onChange()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : 'Speichern fehlgeschlagen' })
    }
  }

  if (officer.status === 'TERMINATED' || (!canEdit && !active)) return null
  return (
    <div>
      {canEdit && (
        <button type="button" onClick={() => { setReason(''); setDuration('1'); setUnit('24'); setOpen(true) }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13px] text-yellow hover:bg-gold/12 transition-colors text-left">
          <CircleSlash size={15} strokeWidth={1.75} />
          {active ? 'Suspendierung verwalten' : 'Suspendieren'}
        </button>
      )}
      {active && (
        <div className="px-3 pb-2.5 pt-1 text-[12px] text-label-3">
          <p>[/] Suspendiert bis {formatDateTime(officer.suspendedUntil!)}</p>
          {officer.suspensionReason && <p className="mt-1 whitespace-pre-wrap break-words">{officer.suspensionReason}</p>}
        </div>
      )}
      <Modal open={open} onClose={() => { if (!loading) setOpen(false) }} title="Suspendierung" description="Die Laufzeit beginnt beim Speichern. Eine bestehende Suspendierung wird ersetzt.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid && !loading) void save() }}>
          <Input label="Dauer" type="number" min={1} max={unit === '24' ? 365 : 8760} step={1} value={duration} onChange={(e) => setDuration(e.target.value)} required />
          <Select label="Einheit" value={unit} onValueChange={setUnit} options={[{ value: '1', label: 'Stunden' }, { value: '24', label: 'Tage' }]} />
          <Textarea label="Grund (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
          <p className="text-xs text-label-3">Nach Ablauf verschwindet der [/]-Marker automatisch. Der Eintrag bleibt in der Akte erhalten.</p>
          <div className="flex flex-wrap justify-end gap-2">
            {active && <Button type="button" variant="secondary" disabled={loading} onClick={() => void save(true)}>Vorzeitig aufheben</Button>}
            <Button type="submit" disabled={loading || !valid}>{loading ? 'Speichert …' : 'Suspendierung speichern'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
