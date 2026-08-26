'use client'

import { useState } from 'react'

import { InternalAffairsNavigation } from '@/components/internal-affairs/internal-affairs-navigation'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'
import { PersonFilesWorkspace } from '@/components/reports/person-files-workspace'
import { useAuth } from '@/context/auth-context'
import { hasPermission } from '@/lib/permissions'

export function InternalAffairsPersonFiles() {
  const { user } = useAuth()
  const canView = hasPermission(user, 'internal-affairs:view')
  const canManage = hasPermission(user, 'internal-affairs:manage')
  const [personId, setPersonId] = useState<string | null>(null)

  if (!canView) return <UnauthorizedContent />

  return (
    <div className="mx-auto max-w-7xl pb-2">
      <InternalAffairsNavigation active="person-files" />
      <PersonFilesWorkspace
        canManage={canManage}
        canDelete={canManage}
        selectedId={personId}
        onSelect={setPersonId}
      />
    </div>
  )
}
