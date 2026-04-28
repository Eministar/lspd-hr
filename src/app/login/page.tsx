'use client'

import { useState } from 'react'
import { useAuth } from '@/context/auth-context'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { useToast } from '@/components/ui/toast'
import Image from 'next/image'
import { Lock, User } from 'lucide-react'

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

  const inputClass = 'w-full h-[42px] pl-10 pr-3.5 rounded-[10px] text-[14px] bg-[#0a1a33]/60 text-[#edf4fb] placeholder:text-[#4a6585] border border-[#18385f]/60 focus:outline-none focus:border-[#d4af37] focus:shadow-[0_0_0_3px_rgba(212,175,55,0.1)] transition-all'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#061426] bg-pattern p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-40%] left-[-20%] w-[80%] h-[80%] rounded-full bg-[#d4af37]/[0.03] blur-[100px]" />
        <div className="absolute bottom-[-30%] right-[-10%] w-[60%] h-[60%] rounded-full bg-[#071b33]/[0.04] blur-[80px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[320px] relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center justify-center h-[88px] w-[88px] rounded-[20px] bg-gradient-to-br from-[#0a2040] to-[#071833] border border-[#d4af37]/30 mb-5 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(212,175,55,0.08)]"
          >
            <Image src="/shield.webp" alt="LSPD" width={72} height={72} className="rounded-full" priority />
          </motion.div>
          <h1 className="text-[18px] font-semibold text-white tracking-[-0.01em]">LSPD HR</h1>
          <p className="text-[12px] font-medium text-[#d4af37]/80 mt-1 tracking-[0.04em]">Personalverwaltung</p>
        </div>

        <div className="glass-panel-elevated rounded-[16px] p-6">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[11.5px] font-semibold text-[#8ea4bd] mb-1.5 ml-0.5 uppercase tracking-[0.06em]">Benutzername</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6585]" strokeWidth={1.75} />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  autoFocus
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-[#8ea4bd] mb-1.5 ml-0.5 uppercase tracking-[0.06em]">Passwort</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6585]" strokeWidth={1.75} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="pt-1">
              <Button type="submit" className="w-full h-[42px] text-[13.5px]" loading={loading}>
                Anmelden
              </Button>
            </div>
          </form>
        </div>

        <p className="text-center text-[10.5px] text-[#4a6585] mt-8 tracking-[0.06em] uppercase font-medium">
          Los Santos Police Department
        </p>
      </motion.div>
    </div>
  )
}
