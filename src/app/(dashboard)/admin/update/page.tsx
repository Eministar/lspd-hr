'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ChevronRight, GitBranch, Loader2, Play, RefreshCw, Terminal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { cn } from '@/lib/utils'

type UpdateStep = 'idle' | 'pull' | 'install' | 'prisma-generate' | 'prisma-push' | 'build' | 'restart' | 'done' | 'error'
type Status = 'idle' | 'running' | 'done' | 'error'

interface UpdateInfo {
  status: Status
  step: UpdateStep
  message: string
  startedAt: string | null
  finishedAt: string | null
  exitCode: number | null
  currentVersion: string | null
  pendingVersion: string | null
  current?: string | null
  remote?: string | null
  hasUpdate?: boolean
}

const STEP_LABELS: Record<UpdateStep, string> = {
  'idle': 'Bereit',
  'pull': 'Git Pull',
  'install': 'Dependencies',
  'prisma-generate': 'Prisma Generate',
  'prisma-push': 'DB Schema',
  'build': 'Build',
  'restart': 'Neustart',
  'done': 'Fertig',
  'error': 'Fehler',
}

const STEP_ORDER: UpdateStep[] = ['pull', 'install', 'prisma-generate', 'prisma-push', 'build', 'restart']

export default function UpdatePage() {
  const { data: info, loading, refetch } = useFetch<UpdateInfo>('/api/system/update')
  const startApi = useApi()
  const { addToast } = useToast()
  const [logs, setLogs] = useState<string[]>([])
  const [healthCheck, setHealthCheck] = useState<'pending' | 'ok' | 'down'>('pending')
  const [restartedAt, setRestartedAt] = useState<number | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const connectStream = () => {
    if (eventSourceRef.current) return
    const es = new EventSource('/api/system/update/stream')
    eventSourceRef.current = es
    es.addEventListener('log', (ev) => {
      const msg = (ev as MessageEvent).data as string
      try {
        const parsed = JSON.parse(msg) as string
        setLogs((prev) => [...prev, parsed])
      } catch {
        setLogs((prev) => [...prev, msg])
      }
    })
    es.addEventListener('state', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as UpdateInfo
      if (data.status === 'done' && (data.step === 'restart' || data.step === 'done')) {
        setRestartedAt(Date.now())
      }
      void refetch()
    })
    es.onerror = () => {
      es.close()
      eventSourceRef.current = null
    }
  }

  useEffect(() => {
    if (info?.status === 'running' || info?.status === 'done' || info?.status === 'error') {
      connectStream()
    }
    return () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.status])

  // Auto-scroll logs to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // After restart: poll health until back up, then reload
  useEffect(() => {
    if (info?.status === 'done' && restartedAt) {
      const tick = async () => {
        try {
          const res = await fetch('/api/health', { cache: 'no-store' })
          if (res.ok) {
            setHealthCheck('ok')
            addToast({ type: 'success', title: 'Server ist zurück', message: 'Seite wird neu geladen …' })
            setTimeout(() => window.location.reload(), 800)
          } else {
            setHealthCheck('down')
          }
        } catch {
          setHealthCheck('down')
        }
      }
      tick()
      const interval = setInterval(tick, 2000)
      const timeout = setTimeout(() => clearInterval(interval), 60_000)
      return () => {
        clearInterval(interval)
        clearTimeout(timeout)
      }
    }
  }, [info?.status, restartedAt, addToast])

  async function start() {
    setConfirmOpen(false)
    setLogs([])
    setHealthCheck('pending')
    setRestartedAt(null)
    try {
      await startApi.execute('/api/system/update', { method: 'POST' })
      addToast({ type: 'success', title: 'Update gestartet' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' })
    }
  }

  if (loading && !info) return <PageLoader />

  const status: Status = info?.status ?? 'idle'
  const step: UpdateStep = info?.step ?? 'idle'
  const isRunning = status === 'running'
  const isDone = status === 'done'
  const isError = status === 'error'
  const hasUpdate = !!info?.hasUpdate

  return (
    <div className="space-y-4">
      <PageHeader
        title="System-Update"
        description="One-Click-Update: Git Pull · Dependencies · Prisma · Build · Neustart"
        action={
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={isRunning}
            loading={isRunning}
          >
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
            {isRunning ? 'Update läuft …' : isDone ? 'Erneut updaten' : 'Update starten'}
          </Button>
        }
      />

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatusCard
          icon={<GitBranch size={16} />}
          label="Aktuelle Version"
          value={info?.currentVersion ?? '—'}
          color="slate"
        />
        <StatusCard
          icon={<ArrowDownToLine size={16} />}
          label="Verfügbar"
          value={hasUpdate ? 'Update verfügbar' : 'Aktuell'}
          color={hasUpdate ? 'amber' : 'emerald'}
        />
        <StatusCard
          icon={isError ? <AlertTriangle size={16} /> : isDone ? <CheckCircle2 size={16} /> : <RefreshCw size={16} className={isRunning ? 'animate-spin' : ''} />}
          label="Status"
          value={STEP_LABELS[step]}
          color={isError ? 'rose' : isDone ? 'emerald' : isRunning ? 'amber' : 'slate'}
        />
      </div>

      {/* Stepper */}
      <div className="rounded-[12px] bg-[#0a1a33]/40 border border-[#18385f] p-4">
        <p className="text-[11px] font-bold text-[#d4af37] uppercase tracking-[0.14em] mb-3">Fortschritt</p>
        <ol className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEP_ORDER.map((s, i) => {
            const isCurrent = step === s
            const isPast = STEP_ORDER.indexOf(step) > i
            const isFailed = isError && isCurrent
            return (
              <li key={s} className="flex items-center gap-1 shrink-0">
                <div className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-[11px] font-medium transition-colors',
                  isCurrent && !isFailed && 'bg-[#d4af37]/15 text-[#d4af37] ring-1 ring-[#d4af37]/30',
                  isCurrent && isFailed && 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
                  isPast && 'bg-emerald-500/10 text-emerald-300',
                  !isCurrent && !isPast && 'bg-[#102542]/50 text-[#4a6585]',
                )}>
                  {isPast ? <CheckCircle2 size={12} /> : isCurrent ? <Loader2 size={12} className="animate-spin" /> : <span className="w-3 h-3 rounded-full border border-current" />}
                  {STEP_LABELS[s]}
                </div>
                {i < STEP_ORDER.length - 1 && <ChevronRight size={12} className="text-[#4a6585]" />}
              </li>
            )
          })}
        </ol>
      </div>

      {/* Live-Logs */}
      <div className="rounded-[12px] bg-[#0a1a33]/40 border border-[#18385f] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#18385f] bg-[#061426]/50">
          <p className="text-[11px] font-bold text-[#d4af37] uppercase tracking-[0.14em] flex items-center gap-1.5">
            <Terminal size={12} /> Live-Logs
          </p>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-[10.5px] text-[#4a6585] hover:text-[#9fb0c4] flex items-center gap-1"
            >
              <X size={10} /> Clear
            </button>
          )}
        </div>
        <div className="h-[400px] overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed">
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[#4a6585] text-[12px]">
              <p>Noch keine Logs. Klicke „Update starten“ um zu beginnen.</p>
            </div>
          ) : (
            <>
              {logs.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    'whitespace-pre-wrap break-all',
                    line.includes('FEHLER') ? 'text-rose-300' :
                    line.includes('Restarting') || line.includes('Neustart') || line.includes('Neustarten') ? 'text-amber-300' :
                    line.startsWith('$') ? 'text-cyan-300/80' :
                    'text-[#cbd5e1]',
                  )}
                >
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Health check after restart */}
      <AnimatePresence>
        {restartedAt && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[12px] bg-[#0a1a33]/60 border border-[#d4af37]/20 p-4 flex items-center gap-3"
          >
            <div className={cn(
              'h-9 w-9 rounded-full flex items-center justify-center',
              healthCheck === 'ok' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300',
            )}>
              {healthCheck === 'ok' ? <CheckCircle2 size={18} /> : <Loader2 size={18} className="animate-spin" />}
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-medium text-white">
                {healthCheck === 'ok' ? 'Server ist zurück online' : 'Warte auf Server-Neustart …'}
              </p>
              <p className="text-[11.5px] text-[#7c93af] mt-0.5">
                {healthCheck === 'ok'
                  ? 'Seite wird in Kürze automatisch neu geladen.'
                  : 'Health-Check läuft alle 2 Sekunden. Maximal 60 Sekunden.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={start}
        currentVersion={info?.currentVersion ?? null}
        hasUpdate={!!hasUpdate}
      />
    </div>
  )
}

function StatusCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: 'slate' | 'amber' | 'emerald' | 'rose' }) {
  const colorMap = {
    slate: 'from-[#102542] to-[#0a1e38] text-[#9fb0c4] border-[#18385f]',
    amber: 'from-amber-500/10 to-[#0a1e38] text-amber-300 border-amber-500/20',
    emerald: 'from-emerald-500/10 to-[#0a1e38] text-emerald-300 border-emerald-500/20',
    rose: 'from-rose-500/10 to-[#0a1e38] text-rose-300 border-rose-500/20',
  }
  return (
    <div className={cn('rounded-[12px] bg-gradient-to-br border p-3.5', colorMap[color])}>
      <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.12em] font-semibold opacity-80">
        {icon} {label}
      </div>
      <p className="text-[16px] font-semibold mt-1.5 text-white tracking-[-0.01em]">{value}</p>
    </div>
  )
}

function ConfirmModal({ open, onClose, onConfirm, currentVersion, hasUpdate }: { open: boolean; onClose: () => void; onConfirm: () => void; currentVersion: string | null; hasUpdate: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#061426]/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-[16px] glass-panel-elevated p-5 space-y-3"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-[10px] bg-[#d4af37]/15 text-[#d4af37] flex items-center justify-center shrink-0">
            <ArrowDownToLine size={18} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white">Update jetzt ausführen?</h3>
            <p className="text-[12.5px] text-[#9fb0c4] mt-1 leading-relaxed">
              Es werden <strong className="text-white">git pull</strong>, <strong className="text-white">npm install</strong>,
              <strong className="text-white"> prisma generate/db push</strong> und <strong className="text-white">npm run build</strong> ausgeführt.
              Anschließend startet der Server automatisch neu.
            </p>
          </div>
        </div>

        <div className="rounded-[10px] bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5 text-[11.5px] text-amber-200/90 flex gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <strong>Hinweis:</strong> Die Seite ist während des Updates kurz nicht erreichbar (~30–120 Sekunden).
            Der Browser lädt automatisch neu, sobald der Server zurück ist.
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11.5px] text-[#7c93af]">
          <span>Aktuelle Version:</span>
          <code className="px-1.5 py-0.5 rounded bg-[#102542] text-[#d4af37] font-mono">{currentVersion ?? '—'}</code>
          {hasUpdate && <span className="text-amber-300">→ Update verfügbar</span>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Abbrechen</Button>
          <Button size="sm" onClick={onConfirm}>
            <Play size={12} /> Update starten
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
