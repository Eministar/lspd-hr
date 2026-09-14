'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizes = {
  sm: 'max-w-[380px]',
  md: 'max-w-[460px]',
  lg: 'max-w-[560px]',
  xl: 'max-w-[720px]',
}

// Sheet-Feder wie bei macOS/iOS: schnell, ohne Nachschwingen.
const sheetSpring = { type: 'spring', stiffness: 520, damping: 40, mass: 0.9 } as const

export function Modal({ open, onClose, title, description, children, className, size = 'md' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                className="fixed inset-0 z-50 bg-black/55"
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <Dialog.Content asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1, transition: sheetSpring }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.14, ease: [0.32, 0.72, 0, 1] } }}
                  className={cn(
                    'lspd-sheet pointer-events-auto relative flex max-h-[85vh] w-full flex-col overflow-hidden',
                    sizes[size],
                    className
                  )}
                >
                  <div className="overflow-y-auto p-6">
                    {title ? (
                      <div className="mb-5">
                        <Dialog.Title className="lspd-modal-title text-[17px] font-semibold tracking-[-0.015em] text-label">
                          {title}
                        </Dialog.Title>
                        {description ? (
                          <Dialog.Description className="mt-1 text-[13.5px] leading-relaxed text-label-2">
                            {description}
                          </Dialog.Description>
                        ) : (
                          <Dialog.Description className="sr-only">Dialog für {title}</Dialog.Description>
                        )}
                      </div>
                    ) : (
                      <>
                        <Dialog.Title className="sr-only">Dialog</Dialog.Title>
                        <Dialog.Description className="sr-only">{description ?? 'Dialogfenster'}</Dialog.Description>
                      </>
                    )}
                    {children}
                  </div>
                  <Dialog.Close asChild>
                    <button
                      className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-label-2 transition-[background-color,color,scale] duration-150 hover:bg-white/[0.14] hover:text-label active:scale-90"
                      aria-label="Schließen"
                    >
                      <X size={14} strokeWidth={2.25} />
                    </button>
                  </Dialog.Close>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
