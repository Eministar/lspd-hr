'use client'

import { DatabaseBackup } from 'lucide-react'
import { useFetch } from '@/hooks/use-fetch'

export function BackupStatus() {
  const { data, error } = useFetch<{ lastSuccess: string | null; current: boolean; failed: boolean }>('/api/admin/backups')
  const label = error ? 'Backup-Status nicht erreichbar' : !data ? 'Backup-Status wird geladen' : data.failed ? 'Backup fehlgeschlagen' : data.current ? 'Heute gesichert' : 'Sicherung ausstehend'
  const detail = data?.lastSuccess ? `Letzte Vollsicherung: ${new Date(data.lastSuccess).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}` : 'Tägliche Vollsicherung von Datenbank, Uploads und Konfiguration.'
  return <span title={detail} className={`inline-flex items-center gap-2 text-[12px] ${data?.current && !data.failed ? 'text-green' : 'text-gold-bright'}`} role="status">
    <DatabaseBackup size={15} /><span>{label}</span>
  </span>
}
