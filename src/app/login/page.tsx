'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { MessageCircle, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'

const REMEMBER_KEY = 'lspd-discord-remember-login'

/** Nur app-interne Pfade weiterreichen — kein offener Redirect. */
function safeRedirect(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return ''
  return value
}

export default function LoginPage() {
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  // Wer über einen geteilten Link (z. B. einen Testlink) hier landet, soll nach
  // dem Login wieder dort ankommen und nicht auf dem Dashboard-Start.
  const [redirect, setRedirect] = useState('')

  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY)
    if (saved !== null) setRemember(saved === '1')

    const params = new URLSearchParams(window.location.search)
    setError(params.get('error') ?? '')
    setRedirect(safeRedirect(params.get('redirect')))
  }, [])

  const startDiscordLogin = () => {
    window.localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')
    const query = new URLSearchParams({ remember: remember ? '1' : '0' })
    if (redirect) query.set('redirect', redirect)
    window.location.href = `/api/auth/discord/login?${query.toString()}`
  }

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
        className="w-full max-w-[360px] relative z-10"
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
          <h1 className="text-[18px] font-semibold text-white tracking-[-0.01em]">LSPD Department</h1>
          <p className="text-[12px] font-medium text-[#d4af37]/80 mt-1 tracking-[0.04em]">Discord Authentifizierung</p>
        </div>

        <div className="glass-panel-elevated rounded-[16px] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="h-10 w-10 rounded-[10px] bg-[#5865f2]/15 flex items-center justify-center text-[#8ea1ff]">
              <MessageCircle size={18} strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-white">Mit Discord anmelden</h2>
              <p className="text-[12px] leading-5 text-[#8ea4bd] mt-1">
                Zugriff wird über deine Discord-Rollen und die zugeordneten Dashboard-Gruppen vergeben.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-[10px] border border-[#3b1616] bg-[#1c1111] px-3 py-2 text-[12px] text-[#fca5a5]">
              {error}
            </div>
          )}

          <label className="mb-4 flex items-center gap-2 rounded-[10px] border border-[#18385f]/60 bg-[#0a1a33]/55 px-3 py-2.5 text-[12.5px] text-[#dbe6f3]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="accent-[#d4af37]"
            />
            Eingeloggt bleiben
          </label>

          <Button type="button" className="w-full h-[42px] text-[13.5px]" onClick={startDiscordLogin}>
            <ShieldCheck size={15} strokeWidth={2} />
            Discord Login
          </Button>

          <Link
            href="/besucherportal"
            className="mt-3 flex h-[36px] items-center justify-center rounded-[9px] border border-[#234568] text-[12.5px] font-medium text-[#dbe6f3] transition-colors hover:bg-[#102542]/65 hover:text-white"
          >
            Besucherportal öffnen
          </Link>
        </div>

        <p className="text-center text-[10.5px] text-[#4a6585] mt-8 tracking-[0.06em] uppercase font-medium">
          Los Santos Police Department
        </p>
      </motion.div>
    </div>
  )
}
