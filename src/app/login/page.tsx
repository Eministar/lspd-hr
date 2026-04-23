'use client'

import { useState } from 'react'
import { useAuth } from '@/context/auth-context'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { useToast } from '@/components/ui/toast'
import Image from 'next/image'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const { addToast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(username, password)
      addToast({ type: 'success', title: 'Willkommen zurück!' })
    } catch (err) {
      addToast({ type: 'error', title: 'Login fehlgeschlagen', message: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full h-[40px] px-3.5 rounded-[10px] text-[14px] bg-[#f5f5f5] dark:bg-[#1a1a1a] text-[#111] dark:text-[#eee] placeholder:text-[#bbb] dark:placeholder:text-[#555] border border-transparent focus:outline-none focus:border-[#ddd] dark:focus:border-[#333] transition-colors'

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a] p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[300px]"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-24 w-24 rounded-[20px] bg-[#111] dark:bg-white mb-5 overflow-hidden">
            <Image src="/shield.webp" alt="LSPD" width={64} height={64} className="invert dark:invert-0" />
          </div>
          <h1 className="text-[17px] font-semibold text-[#111] dark:text-white">LSPD HR</h1>
          <p className="text-[12.5px] text-[#999] mt-1">Personalverwaltung</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div>
            <label className="block text-[12px] font-medium text-[#999] mb-1.5 ml-0.5">Benutzername</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              autoFocus
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#999] mb-1.5 ml-0.5">Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className={inputClass}
            />
          </div>
          <div className="pt-2">
            <Button type="submit" className="w-full h-[40px] text-[13.5px]" loading={loading}>
              Anmelden
            </Button>
          </div>
        </form>

        <p className="text-center text-[11px] text-[#ccc] dark:text-[#333] mt-10 tracking-wide">
          Los Santos Police Department
        </p>
      </motion.div>
    </div>
  )
}
