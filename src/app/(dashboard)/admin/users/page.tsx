'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Edit, ShieldCheck, UserCog } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/context/auth-context'
import { formatDate } from '@/lib/utils'
import { PERMISSIONS, PERMISSION_LABELS, type Permission } from '@/lib/permissions'

interface User {
  id: string
  username: string
  displayName: string
  discordId: string | null
  discordUsername?: string | null
  avatarUrl: string | null
  groupIds: string[]
  permissions: Permission[]
  groups: { id: string; name: string }[]
  createdAt: string | null
  lastLoginAt?: string | null
  discordOnly?: boolean
}

const READ_PERMISSIONS = PERMISSIONS.filter((permission) => permission.endsWith(':view'))
const MANAGE_PERMISSIONS = PERMISSIONS.filter((permission) => !permission.endsWith(':view'))

function UserAvatar({ user }: { user: User }) {
  if (user.avatarUrl) {
    return (
      <span
        className="h-9 w-9 shrink-0 rounded-full bg-cover bg-center ring-1 ring-[#d4af37]/20"
        style={{ backgroundImage: `url(${user.avatarUrl})` }}
        aria-label={user.displayName}
      />
    )
  }

  return (
    <div className="h-9 w-9 rounded-full bg-[#102542] flex items-center justify-center text-[12px] font-semibold text-[#d4af37]">
      {user.displayName.charAt(0).toUpperCase()}
    </div>
  )
}

export default function UsersPage() {
  const { data: users, loading, refetch } = useFetch<User[]>('/api/users')
  const { user: currentUser, refreshUser } = useAuth()
  const { execute } = useApi()
  const { addToast } = useToast()
  const [editUser, setEditUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])

  const openEdit = (user: User) => {
    setEditUser(user)
    setPermissions(user.permissions ?? [])
  }

  const togglePermission = (permission: Permission, checked: boolean) => {
    setPermissions((prev) => (
      checked
        ? Array.from(new Set([...prev, permission]))
        : prev.filter((p) => p !== permission)
    ))
  }

  const savePermissions = async () => {
    if (!editUser) return
    try {
      await execute(`/api/users/${editUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions }),
      })
      addToast({ type: 'success', title: 'Direkte Rechte gespeichert' })
      setEditUser(null)
      if (editUser.id === currentUser?.id) await refreshUser()
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  const permissionSections = (
    <>
      <div>
        <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-2">Direkte Leserechte</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {READ_PERMISSIONS.map((permission) => (
            <Checkbox
              key={permission}
              checked={permissions.includes(permission)}
              onCheckedChange={(checked) => togglePermission(permission, checked)}
              label={PERMISSION_LABELS[permission]}
              className="rounded-[8px] bg-[#0a1a33]/40 border border-[#18385f]/50 px-3 py-2"
            />
          ))}
        </div>
      </div>
      <div>
        <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-2">Direkte Verwaltungsrechte</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MANAGE_PERMISSIONS.map((permission) => (
            <Checkbox
              key={permission}
              checked={permissions.includes(permission)}
              onCheckedChange={(checked) => togglePermission(permission, checked)}
              label={PERMISSION_LABELS[permission]}
              className="rounded-[8px] bg-[#0a1a33]/40 border border-[#18385f]/50 px-3 py-2"
            />
          ))}
        </div>
      </div>
    </>
  )

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Discord-Benutzer"
        description="Discord-User mit Dashboard-Zugriff ansehen und direkte Zusatzrechte vergeben"
      />

      <div className="glass-panel-elevated rounded-[14px] overflow-hidden">
        <div className="divide-y divide-[#18385f]">
          {users?.map((user, index) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.02 }}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#0f2340] transition-colors"
            >
              <UserAvatar user={user} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13.5px] font-medium text-[#eee]">{user.displayName}</p>
                  {user.discordOnly && (
                    <span className="inline-flex items-center gap-1 rounded-[5px] border border-[#234568] bg-[#0a1a33]/70 px-2 py-0.5 text-[10.5px] text-[#8ea4bd]">
                      <ShieldCheck size={10} /> Discord
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] text-[#4a6585]">
                  @{user.discordUsername || user.username} · Discord: {user.discordId || 'nicht verbunden'} · {user.groups.length ? user.groups.map((group) => group.name).join(', ') : 'Keine Gruppe'} · {user.permissions.length} direkte Rechte · Letzter Login: {formatDate(user.lastLoginAt)}
                </p>
              </div>
              <span className="text-[11.5px] font-medium text-[#888] bg-[#0f2340] px-2 py-[3px] rounded-[5px]">
                {user.groups.length ? `${user.groups.length} Gruppen` : 'Keine Gruppe'}
              </span>
              <button onClick={() => openEdit(user)} className="p-1.5 rounded-[6px] hover:bg-[#0f2340] transition-colors">
                <Edit size={13} className="text-[#4a6585]" />
              </button>
            </motion.div>
          ))}
          {(!users || users.length === 0) && (
            <div className="text-center py-16">
              <UserCog size={28} className="mx-auto mb-3 text-[#333]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#999]">Keine Discord-Benutzer gefunden</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Direkte Rechte bearbeiten" size="lg">
        <div className="space-y-4">
          {editUser && (
            <div className="flex items-center gap-3 rounded-[12px] border border-[#18385f]/55 bg-[#0a1a33]/45 p-3">
              <UserAvatar user={editUser} />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-white">{editUser.displayName}</p>
                <p className="truncate text-[11.5px] text-[#6b8299]">
                  Gruppen aus Discord-Rollen: {editUser.groups.length ? editUser.groups.map((group) => group.name).join(', ') : 'Keine'}
                </p>
              </div>
            </div>
          )}
          <p className="text-[11.5px] text-[#6b8299]">
            Direkte Rechte werden zusätzlich zu den Rechten aus Discord-Rollen und Benutzergruppen vergeben.
          </p>
          {permissionSections}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setEditUser(null)}>Abbrechen</Button>
            <Button size="sm" onClick={savePermissions}>Speichern</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
