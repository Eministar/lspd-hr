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
                transition={{ duration: 0.15 }}
                className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] z-50"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 6 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
                  'w-[calc(100%-2rem)]', sizes[size],
                  'bg-white dark:bg-[#111] rounded-[14px]',
                  'shadow-[0_20px_60px_-10px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.5)]',
                  'max-h-[85vh] overflow-y-auto',
                  className
                )}
              >
                <div className="p-6">
                  {title && (
                    <div className="mb-5">
                      <Dialog.Title className="text-[15px] font-semibold text-[#111] dark:text-white">
                        {title}
                      </Dialog.Title>
                      {description && (
                        <Dialog.Description className="text-[13px] text-[#888] mt-1">
                          {description}
                        </Dialog.Description>
                      )}
                    </div>
                  )}
                  {children}
                </div>
                <Dialog.Close asChild>
                  <button
                    className="absolute top-4 right-4 p-1.5 rounded-[8px] text-[#bbb] dark:text-[#555] hover:text-[#666] dark:hover:text-[#999] hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] transition-colors"
                    aria-label="Schließen"
                  >
                    <X size={15} strokeWidth={2} />
                  </button>
                </Dialog.Close>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
