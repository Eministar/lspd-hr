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
    <main className="login-layout">
      <section className="login-intro">
        <div className="flex items-center gap-3 text-[#e4c477]">
          <Image src="/shield.webp" alt="LSPD Wappen" width={48} height={48} priority />
          <span className="text-[14px] font-semibold">Los Santos Police Department</span>
        </div>
        <div>
          <h1>Gemeinsam im Einsatz.</h1>
          <p>Dein Department. Deine Übersicht. Personal, Ausbildung und täglicher Dienst an einem Ort.</p>
        </div>
        <p className="mt-12 text-[12px]">Personal- und Einsatzverwaltung des LSPD</p>
      </section>
      <section className="login-access" aria-label="Anmeldung">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px] relative z-10"
      >
        <div className="mb-7">
          <h2 className="text-[30px] font-semibold text-white">Willkommen zurück.</h2>
          <p className="text-[14px] text-[#a6b5c3] mt-2">Melde dich an, um deinen Dienst zu organisieren.</p>
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

        <p className="text-center text-[10.5px] text-[#a6b5c3] mt-8 font-medium">
          Los Santos Police Department
        </p>
      </motion.div>
      </section>
    </main>
  )
}
