'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

const SHOW_AFTER_PX = 360

/** Globaler Schnellzugriff, damit lange Dashboard-Seiten jederzeit erreichbar bleiben. */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > SHOW_AFTER_PX)
    updateVisibility()
    window.addEventListener('scroll', updateVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateVisibility)
  }, [])

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Nach oben scrollen"
      title="Nach oben"
      className={`fixed bottom-5 right-5 z-40 inline-flex h-10 w-10 items-center justify-center rounded-[11px] border border-[#d4af37]/35 bg-[#0a203d]/92 text-[#d4af37] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-[opacity,transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[#102947] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426] ${visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
    >
      <ArrowUp size={17} strokeWidth={2.2} />
    </button>
  )
}
