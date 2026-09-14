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
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        className="lspd-login-content"
      >
        <div className="lspd-login-heading">
          <div className="lspd-login-emblem">
            <Image src="/shield.webp" alt="LSPD Wappen" width={80} height={80} priority />
          </div>
          <h1>LSPD Department</h1>
          <p>Personal. Ausbildung. Einsatz.</p>
        </div>
        <section className="lspd-login-card" aria-labelledby="login-title">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo/20 text-indigo">
              <MessageCircle size={19} strokeWidth={1.9} />
            </div>
            <div>
              <h2 id="login-title">Willkommen zurück</h2>
              <p className="mt-0.5 text-[13px] text-label-3">Anmelden mit deinem Discord-Konto</p>
            </div>
          </div>
          <p className="lspd-login-description">Deine Discord-Rollen bestimmen, auf welche Bereiche des Departments du zugreifen kannst.</p>
          {error && (
            <div role="alert" className="mt-4 rounded-[10px] bg-red/12 px-3.5 py-3 text-[13px] text-red">{error}</div>
          )}
          <label className="lspd-login-remember">
            <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />
            Eingeloggt bleiben
          </label>
          <Button type="button" size="lg" className="h-11 w-full" onClick={startDiscordLogin}>
            <ShieldCheck size={17} strokeWidth={2} />
            Mit Discord anmelden
          </Button>
          <div className="mt-6 flex flex-col items-center gap-1 border-t border-line pt-5">
            <span className="text-[13px] text-label-3">Du möchtest dich beim LSPD bewerben?</span>
            <Link href="/besucherportal" className="rounded-[7px] px-3 py-1.5 text-[13.5px] font-medium text-gold-bright transition-colors hover:bg-white/[0.06]">Zum Besucherportal</Link>
          </div>
        </section>
        <p className="lspd-login-footer">Los Santos Police Department</p>
      </motion.div>
    </main>
  )
}
