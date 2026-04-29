'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/context/auth-context'
import { formatDate } from '@/lib/utils'

interface User {
  id: string
  username: string
  displayName: string
  groupId: string | null
  group: { id: string; name: string } | null
  createdAt: string
}

interface UserGroup {
  id: string
  name: string
}

export default function UsersPage() {
  const { data: users, loading, refetch } = useFetch<User[]>('/api/users')
  const { data: groups } = useFetch<UserGroup[]>('/api/user-groups')
  const { user: currentUser } = useAuth()
  const { execute } = useApi()
  const { addToast } = useToast()

  const [createModal, setCreateModal] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [form, setForm] = useState({ username: '', password: '', displayName: '', groupId: '' })

  const openCreate = () => {
    setForm({ username: '', password: '', displayName: '', groupId: '' })
    setCreateModal(true)
  }

  const openEdit = (u: User) => {
    setForm({ username: u.username, password: '', displayName: u.displayName, groupId: u.groupId ?? '' })
    setEditUser(u)
  }

  const handleCreate = async () => {
    try {
      await execute('/api/users', { method: 'POST', body: JSON.stringify(form) })
      addToast({ type: 'success', title: 'Benutzer erstellt' })
      setCreateModal(false)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleUpdate = async () => {
    if (!editUser) return
    try {
      const data: Record<string, string | null> = { displayName: form.displayName, groupId: form.groupId || null }
      if (form.password) data.password = form.password
      await execute(`/api/users/${editUser.id}`, { method: 'PATCH', body: JSON.stringify(data) })
      addToast({ type: 'success', title: 'Benutzer aktualisiert' })
      setEditUser(null)
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await execute(`/api/users/${id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Benutzer gelöscht' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Benutzer verwalten"
        description="Dashboard-Benutzer und Benutzergruppen verwalten"
        action={<Button size="sm" onClick={openCreate}><Plus size={14} strokeWidth={2} /> Neuer Benutzer</Button>}
      />

      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        <div className="divide-y divide-[#18385f]">
          {users?.map((u, i) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#0f2340] transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-[#102542] flex items-center justify-center text-[12px] font-semibold text-[#d4af37]">
                {u.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-medium text-[#eee]">{u.displayName}</p>
                <p className="text-[11.5px] text-[#4a6585]">
                  @{u.username} · {u.group?.name || 'Keine Gruppe'} · Erstellt: {formatDate(u.createdAt)}
                </p>
              </div>
              <span className="text-[11.5px] font-medium text-[#888] bg-[#0f2340] px-2 py-[3px] rounded-[5px]">
                {u.group?.name || 'Keine Gruppe'}
              </span>
              <div className="flex gap-0.5">
                <button onClick={() => openEdit(u)} className="p-1.5 rounded-[6px] hover:bg-[#0f2340] transition-colors">
                  <Edit size={13} className="text-[#4a6585]" />
                </button>
                {u.id !== currentUser?.id && (
                  <button onClick={() => handleDelete(u.id)} className="p-1.5 rounded-[6px] hover:bg-[#1c1111] transition-colors">
                    <Trash2 size={13} className="text-[#4a6585] hover:text-[#f87171]" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
          {(!users || users.length === 0) && (
            <div className="text-center py-16">
              <UserCog size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#999]">Keine Benutzer vorhanden</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Neuer Benutzer">
        <div className="space-y-4">
          <Input label="Benutzername" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <Input label="Anzeigename" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
          <Input label="Passwort" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Select
            label="Benutzergruppe"
            value={form.groupId}
            onValueChange={(groupId) => setForm({ ...form, groupId })}
            options={[
              { value: '', label: 'Keine Gruppe' },
              ...(groups?.map((group) => ({ value: group.id, label: group.name })) || []),
            ]}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setCreateModal(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleCreate} disabled={!form.username || !form.password || !form.displayName}>Erstellen</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Benutzer bearbeiten">
        <div className="space-y-4">
          <Input label="Anzeigename" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <Input label="Neues Passwort (optional)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leer lassen um nicht zu ändern" />
          <Select
            label="Benutzergruppe"
            value={form.groupId}
            onValueChange={(groupId) => setForm({ ...form, groupId })}
            options={[
              { value: '', label: 'Keine Gruppe' },
              ...(groups?.map((group) => ({ value: group.id, label: group.name })) || []),
            ]}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setEditUser(null)}>Abbrechen</Button>
            <Button size="sm" onClick={handleUpdate}>Speichern</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
