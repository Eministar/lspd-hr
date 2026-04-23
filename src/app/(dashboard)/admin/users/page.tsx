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
import { getRoleLabel, formatDate } from '@/lib/utils'

interface User { id: string; username: string; displayName: string; role: string; createdAt: string }

const roleOptions = [
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'HR', label: 'HR' },
  { value: 'LEADERSHIP', label: 'Führungsebene' },
  { value: 'READONLY', label: 'Nur Lesen' },
]

export default function UsersPage() {
  const { data: users, loading, refetch } = useFetch<User[]>('/api/users')
  const { user: currentUser } = useAuth()
  const { execute } = useApi()
  const { addToast } = useToast()

  const [createModal, setCreateModal] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'READONLY' })

  const openCreate = () => {
    setForm({ username: '', password: '', displayName: '', role: 'READONLY' })
    setCreateModal(true)
  }

  const openEdit = (u: User) => {
    setForm({ username: u.username, password: '', displayName: u.displayName, role: u.role })
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
      const data: Record<string, string> = { displayName: form.displayName, role: form.role }
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
        description="Dashboard-Benutzer und Rollen verwalten"
        action={<Button size="sm" onClick={openCreate}><Plus size={14} strokeWidth={2} /> Neuer Benutzer</Button>}
      />

      <div className="bg-[#fafafa] dark:bg-[#111] rounded-[12px] overflow-hidden">
        <div className="divide-y divide-[#f0f0f0] dark:divide-[#1a1a1a]">
          {users?.map((u, i) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#f5f5f5] dark:hover:bg-[#151515] transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-[#eee] dark:bg-[#222] flex items-center justify-center text-[12px] font-semibold text-[#888]">
                {u.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium text-[#111] dark:text-[#eee]">{u.displayName}</p>
                <p className="text-[11.5px] text-[#bbb] dark:text-[#555]">@{u.username} · Erstellt: {formatDate(u.createdAt)}</p>
              </div>
              <span className="text-[11.5px] font-medium text-[#888] bg-[#f0f0f0] dark:bg-[#1a1a1a] px-2 py-[3px] rounded-[5px]">
                {getRoleLabel(u.role)}
              </span>
              <div className="flex gap-0.5">
                <button onClick={() => openEdit(u)} className="p-1.5 rounded-[6px] hover:bg-[#eee] dark:hover:bg-[#1a1a1a] transition-colors">
                  <Edit size={13} className="text-[#ccc] dark:text-[#555]" />
                </button>
                {u.id !== currentUser?.id && (
                  <button onClick={() => handleDelete(u.id)} className="p-1.5 rounded-[6px] hover:bg-[#fef2f2] dark:hover:bg-[#1c1111] transition-colors">
                    <Trash2 size={13} className="text-[#ccc] dark:text-[#555] hover:text-[#f87171]" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
          {(!users || users.length === 0) && (
            <div className="text-center py-16">
              <UserCog size={28} className="mx-auto mb-3 text-[#ddd] dark:text-[#333]" strokeWidth={1.5} />
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
          <Select label="Rolle" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={roleOptions} />
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
          <Select label="Rolle" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={roleOptions} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setEditUser(null)}>Abbrechen</Button>
            <Button size="sm" onClick={handleUpdate}>Speichern</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
