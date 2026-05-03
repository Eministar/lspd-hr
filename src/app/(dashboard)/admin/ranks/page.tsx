 'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Shield, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'

interface Rank {
  id: string
  name: string
  sortOrder: number
  color: string
  badgeMin: number | null
  badgeMax: number | null
}

interface BlacklistedBadge {
  id: string
  badgeNumber: string
  reason: string | null
  createdAt: string
}

interface DiscordRole {
  id: string
  name: string
}

interface DiscordConfigResponse {
  config: {
    rankRoleMap: Record<string, string>
  }
  roles: DiscordRole[]
}

export default function RanksPage() {
  const { data: ranks, loading, refetch } = useFetch<Rank[]>('/api/ranks')
  const { data: blacklistedBadges, loading: blacklistLoading, refetch: refetchBlacklist } = useFetch<BlacklistedBadge[]>('/api/badge-blacklist')
  const { data: discordData, loading: discordLoading, refetch: refetchDiscord } = useFetch<DiscordConfigResponse>('/api/discord/config')
  const { execute } = useApi()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState<'ranks' | 'blacklist'>('ranks')
  const [modalOpen, setModalOpen] = useState(false)
  const [blacklistModalOpen, setBlacklistModalOpen] = useState(false)
  const [editRank, setEditRank] = useState<Rank | null>(null)
  const [form, setForm] = useState({
    name: '',
    sortOrder: 0,
    color: '#3B82F6',
    badgeMin: '' as string,
    badgeMax: '' as string,
    discordRoleId: '',
  })
  const [blacklistForm, setBlacklistForm] = useState({ badgeNumber: '', reason: '' })

  const openCreate = () => {
    setForm({
      name: '',
      sortOrder: (ranks?.length || 0) + 1,
      color: '#3B82F6',
      badgeMin: '',
      badgeMax: '',
      discordRoleId: '',
    })
    setEditRank(null)
    setModalOpen(true)
  }

  const openEdit = (rank: Rank) => {
    setForm({
      name: rank.name,
      sortOrder: rank.sortOrder,
      color: rank.color,
      badgeMin: rank.badgeMin != null ? String(rank.badgeMin) : '',
      badgeMax: rank.badgeMax != null ? String(rank.badgeMax) : '',
      discordRoleId: discordData?.config.rankRoleMap[rank.id] || '',
    })
    setEditRank(rank)
    setModalOpen(true)
  }

  const saveRankRole = async (rankId: string, roleId: string) => {
    const rankRoleMap = { ...(discordData?.config.rankRoleMap || {}) }
    if (roleId) rankRoleMap[rankId] = roleId
    else delete rankRoleMap[rankId]

    await execute('/api/discord/config', {
      method: 'POST',
      body: JSON.stringify({ rankRoleMap }),
    })
    await refetchDiscord()
  }

  const handleSave = async () => {
    const payload = {
      name: form.name,
      sortOrder: form.sortOrder,
      color: form.color,
      badgeMin: form.badgeMin.trim() === '' ? null : form.badgeMin,
      badgeMax: form.badgeMax.trim() === '' ? null : form.badgeMax,
    }
    try {
      if (editRank) {
        await execute(`/api/ranks/${editRank.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        await saveRankRole(editRank.id, form.discordRoleId)
        addToast({ type: 'success', title: 'Rang aktualisiert' })
      } else {
        const rank = await execute('/api/ranks', { method: 'POST', body: JSON.stringify(payload) }) as Rank | null
        if (rank) await saveRankRole(rank.id, form.discordRoleId)
        addToast({ type: 'success', title: 'Rang erstellt' })
      }
      setModalOpen(false)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await execute(`/api/ranks/${id}`, { method: 'DELETE' })
      await saveRankRole(id, '')
      addToast({ type: 'success', title: 'Rang gelöscht' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const openBlacklistCreate = () => {
    setBlacklistForm({ badgeNumber: '', reason: '' })
    setBlacklistModalOpen(true)
  }

  const handleBlacklistSave = async () => {
    try {
      await execute('/api/badge-blacklist', {
        method: 'POST',
        body: JSON.stringify({
          badgeNumber: blacklistForm.badgeNumber,
          reason: blacklistForm.reason.trim() || null,
        }),
      })
      addToast({ type: 'success', title: 'Dienstnummer gesperrt' })
      setBlacklistModalOpen(false)
      await refetchBlacklist()
    } catch (err) {
      addToast({ type: 'error', title: 'Warnung', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleBlacklistDelete = async (id: string) => {
    try {
      await execute(`/api/badge-blacklist/${id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Sperre entfernt' })
      await refetchBlacklist()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading || blacklistLoading || discordLoading) return <PageLoader />

  const roleOptions = [
    { value: '', label: 'Keine Discord-Rolle' },
    ...(discordData?.roles.map((role) => ({ value: role.id, label: role.name })) || []),
  ]

  const roleName = (roleId: string | undefined) => discordData?.roles.find((role) => role.id === roleId)?.name

  return (
    <div>
      <PageHeader
        title="Ränge verwalten"
        description="Ränge, Dienstnummern-Bereiche und gesperrte Dienstnummern"
        action={
          activeTab === 'ranks' ? (
            <Button size="sm" onClick={openCreate}><Plus size={14} strokeWidth={2} /> Neuer Rang</Button>
          ) : (
            <Button size="sm" onClick={openBlacklistCreate}><Plus size={14} strokeWidth={2} /> DN sperren</Button>
          )
        }
      />

      <div className="flex gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('ranks')}
          className={`px-3 py-2 rounded-[8px] text-[12.5px] font-medium transition-colors ${activeTab === 'ranks' ? 'bg-[#d4af37] text-[#071b33]' : 'bg-[#0f2340] text-[#8ea4bd] hover:text-[#eee]'}`}
        >
          Ränge
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('blacklist')}
          className={`px-3 py-2 rounded-[8px] text-[12.5px] font-medium transition-colors ${activeTab === 'blacklist' ? 'bg-[#d4af37] text-[#071b33]' : 'bg-[#0f2340] text-[#8ea4bd] hover:text-[#eee]'}`}
        >
          DN-Blacklist
        </button>
      </div>

      {activeTab === 'ranks' ? (
      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        <div className="divide-y divide-[#18385f]">
          {ranks?.map((rank, i) => (
            <motion.div
              key={rank.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#0f2340] transition-colors"
            >
              <span className="text-[12px] text-[#bbb] font-mono w-6 text-right">{rank.sortOrder}</span>
              <div className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: rank.color }} />
              <div className="flex-1 min-w-0">
                <span className="text-[13.5px] font-medium text-[#eee]">{rank.name}</span>
                {rank.badgeMin != null && rank.badgeMax != null && (
                  <span className="ml-2 text-[10px] text-[#4a6585] font-mono">DN {rank.badgeMin}–{rank.badgeMax}</span>
                )}
                {roleName(discordData?.config.rankRoleMap[rank.id]) && (
                  <span className="ml-2 text-[11px] text-[#6b8299]">Discord: {roleName(discordData?.config.rankRoleMap[rank.id])}</span>
                )}
              </div>
              <div className="flex gap-0.5">
                <button onClick={() => openEdit(rank)} className="p-1.5 rounded-[6px] hover:bg-[#0f2340] transition-colors">
                  <Edit size={13} className="text-[#4a6585]" />
                </button>
                <button onClick={() => handleDelete(rank.id)} className="p-1.5 rounded-[6px] hover:bg-[#1c1111] transition-colors">
                  <Trash2 size={13} className="text-[#4a6585] hover:text-[#f87171]" />
                </button>
              </div>
            </motion.div>
          ))}
          {(!ranks || ranks.length === 0) && (
            <div className="text-center py-16">
              <Shield size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#999]">Keine Ränge vorhanden</p>
            </div>
          )}
        </div>
      </div>
      ) : (
        <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
          <div className="divide-y divide-[#18385f]">
            {blacklistedBadges?.map((row, i) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#0f2340] transition-colors"
              >
                <div className="h-8 w-8 rounded-[8px] bg-[#1c1111] flex items-center justify-center text-[#f87171]">
                  <Ban size={15} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-mono font-medium text-[#eee]">{row.badgeNumber}</p>
                  <p className="text-[11.5px] text-[#4a6585] truncate">{row.reason || 'Keine Begründung'}</p>
                </div>
                <button onClick={() => handleBlacklistDelete(row.id)} className="p-1.5 rounded-[6px] hover:bg-[#1c1111] transition-colors">
                  <Trash2 size={13} className="text-[#4a6585] hover:text-[#f87171]" />
                </button>
              </motion.div>
            ))}
            {(!blacklistedBadges || blacklistedBadges.length === 0) && (
              <div className="text-center py-16">
                <Ban size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
                <p className="text-[13px] text-[#999]">Keine Dienstnummern gesperrt</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editRank ? 'Rang bearbeiten' : 'Neuer Rang'}>
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Reihenfolge" type="number" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
          <div className="space-y-1.5">
            <label className="block text-[12.5px] font-medium text-[#777]">Farbe</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-12 rounded-[8px] border border-[#18385f] cursor-pointer bg-transparent" />
              <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1" />
            </div>
          </div>
          <p className="text-[11.5px] text-[#6b8299]">
            Dienstnummer-Bereich (nur Zahl, optional): Bei Rangwechsel wird automatisch die kleinste freie Nummer in diesem Bereich vergeben (Einstellungen: Präfix z. B. LSPD-).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="DN von"
              value={form.badgeMin}
              onChange={(e) => setForm({ ...form, badgeMin: e.target.value })}
              placeholder="z. B. 1"
            />
            <Input
              label="DN bis"
              value={form.badgeMax}
              onChange={(e) => setForm({ ...form, badgeMax: e.target.value })}
              placeholder="z. B. 10"
            />
          </div>
          <Select
            label="Discord-Rolle"
            value={form.discordRoleId}
            onValueChange={(discordRoleId) => setForm({ ...form, discordRoleId })}
            options={roleOptions}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name.trim()}>Speichern</Button>
          </div>
        </div>
      </Modal>

      <Modal open={blacklistModalOpen} onClose={() => setBlacklistModalOpen(false)} title="Dienstnummer sperren">
        <div className="space-y-4">
          <Input
            label="Dienstnummer"
            value={blacklistForm.badgeNumber}
            onChange={(e) => setBlacklistForm({ ...blacklistForm, badgeNumber: e.target.value })}
            placeholder="z. B. 500 oder LSPD-500"
            required
          />
          <Input
            label="Grund (optional)"
            value={blacklistForm.reason}
            onChange={(e) => setBlacklistForm({ ...blacklistForm, reason: e.target.value })}
            placeholder="Warum soll diese DN nicht vergeben werden?"
          />
          <p className="text-[11.5px] text-[#6b8299]">
            Gesperrte Dienstnummern werden bei automatischer Vergabe übersprungen und können nicht manuell eingetragen werden.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setBlacklistModalOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleBlacklistSave} disabled={!blacklistForm.badgeNumber.trim()}>Sperren</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
