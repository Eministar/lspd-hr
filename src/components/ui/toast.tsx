'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }

const typeColors = {
  success: 'text-green',
  error: 'text-red',
  warning: 'text-yellow',
  info: 'text-blue',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...toast, id }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2" aria-live="polite">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => {
            const Icon = icons[toast.type]
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 500, damping: 38 } }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                className="lspd-popover flex items-start gap-3 rounded-[12px] px-3.5 py-3"
                role="status"
              >
                <Icon size={18} className={`mt-px shrink-0 ${typeColors[toast.type]}`} strokeWidth={2} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-label">{toast.title}</p>
                  {toast.message && <p className="mt-0.5 text-[12.5px] leading-snug text-label-2">{toast.message}</p>}
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  aria-label="Hinweis schließen"
                  className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label-3 transition-colors hover:bg-white/[0.08] hover:text-label"
                >
                  <X size={13} strokeWidth={2.25} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
