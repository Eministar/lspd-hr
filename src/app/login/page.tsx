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
    <main className="lspd-login">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="lspd-login-content"
      >
        <div className="lspd-login-heading">
          <div className="lspd-login-emblem">
            <Image src="/shield.webp" alt="LSPD Wappen" width={80} height={80} priority />
          </div>
          <h1>LSPD Department</h1>
          <p>Personal. Ausbildung. Einsatz.</p>
        </div>
        <section className="lspd-login-card glass-panel-elevated" aria-labelledby="login-title">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 shrink-0 rounded-xl border border-[#8795ff]/20 bg-[#5865f2]/15 flex items-center justify-center text-[#a4b1ff]">
              <MessageCircle size={20} strokeWidth={1.7} />
            </div>
            <div>
              <h2 id="login-title" className="text-white">Willkommen zurück</h2>
              <p className="text-[12px] text-[#8ea4bd] mt-0.5">Anmelden mit deinem Discord-Konto</p>
            </div>
          </div>
          <p className="lspd-login-description">Deine Discord-Rollen bestimmen, auf welche Bereiche des Departments du zugreifen kannst.</p>
          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-3 text-[13px] text-[#fca5a5]">{error}</div>
          )}
          <label className="lspd-login-remember">
            <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />
            Eingeloggt bleiben
          </label>
          <Button type="button" className="w-full h-[46px] text-[14px]" onClick={startDiscordLogin}>
            <ShieldCheck size={17} strokeWidth={1.9} />
            Mit Discord anmelden
          </Button>
          <div className="mt-6 pt-5 border-t border-[#335276]/45 flex flex-col items-center gap-2">
            <span className="text-[12px] text-[#8ea4bd]">Du möchtest dich beim LSPD bewerben?</span>
            <Link href="/besucherportal" className="text-[13px] text-[#e5c777] font-medium rounded-md px-3 py-1.5 transition-colors hover:bg-[#d4af37]/10 hover:text-[#f8dfa4]">Zum Besucherportal</Link>
          </div>
        </section>
        <p className="lspd-login-footer">Los Santos Police Department</p>
      </motion.div>
    </main>
  )
}
