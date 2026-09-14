'use client'

import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { LIVE_REFRESH_INTERVAL_MS, LIVE_UPDATE_CHANNEL, LIVE_UPDATE_EVENT } from '@/lib/live-updates'

// Fokus und visibilitychange feuern beim Tab-Wechsel gemeinsam — ein Refetch reicht.
const SILENT_REFRESH_MIN_GAP_MS = 1000

/**
 * True, wenn der Nutzer gerade in einem editierbaren Element tippt (Input,
 * Textarea, Select oder contentEditable). Der stille Hintergrund-Refetch würde
 * sonst `data` überschreiben und Formulare/Editoren, die ihren Bearbeitungs-State
 * aus `data` seeden, während des Tippens zurücksetzen — Eingaben gingen verloren.
 * Explizite refetch()-Aufrufe (z. B. nach dem Speichern) sind davon NICHT betroffen.
 */
function isEditingActiveElement(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el.isContentEditable === true
}

interface UseFetchResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  setData: Dispatch<SetStateAction<T | null>>
}

export function useFetch<T>(url: string | null): UseFetchResult<T> {
  const [data, setDataState] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  // Rohantwort des zuletzt übernommenen Stands. Liefert der 5-Sekunden-Poll
  // exakt dasselbe, bleibt `data` referenzgleich — sonst rendert die ganze
  // Seite (inkl. großer Tabellen) alle 5 Sekunden ohne sichtbare Änderung neu.
  const lastPayloadRef = useRef<string | null>(null)
  const silentInFlightRef = useRef(false)
  const lastSilentRefreshRef = useRef(0)

  // Lokale Änderungen (optimistische Updates) machen den Vergleichsstand
  // ungültig, damit der nächste Poll den Serverstand wieder durchsetzt.
  const setData = useCallback<Dispatch<SetStateAction<T | null>>>((value) => {
    lastPayloadRef.current = null
    setDataState(value)
  }, [])

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    if (!url) {
      lastPayloadRef.current = null
      setLoading(false)
      setDataState(null)
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!options?.silent) {
      setLoading(true)
    }
    setError(null)
    try {
      const res = await fetch(url, { cache: 'no-store' })
      const payload = await res.text()
      const json = JSON.parse(payload)
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Fehler beim Laden')
      }
      if (requestIdRef.current === requestId && payload !== lastPayloadRef.current) {
        lastPayloadRef.current = payload
        setDataState(json.data)
      }
    } catch (e) {
      if (requestIdRef.current === requestId) {
        setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [url])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!url) {
      return
    }

    const refreshSilently = () => {
      if (document.visibilityState !== 'visible' || isEditingActiveElement()) return
      // Langsame Antworten dürfen sich nicht stapeln.
      if (silentInFlightRef.current) return
      const now = Date.now()
      if (now - lastSilentRefreshRef.current < SILENT_REFRESH_MIN_GAP_MS) return
      lastSilentRefreshRef.current = now
      silentInFlightRef.current = true
      void fetchData({ silent: true }).finally(() => {
        silentInFlightRef.current = false
      })
    }

    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(LIVE_UPDATE_CHANNEL) : null

    window.addEventListener('focus', refreshSilently)
    window.addEventListener(LIVE_UPDATE_EVENT, refreshSilently)
    document.addEventListener('visibilitychange', refreshSilently)
    channel?.addEventListener('message', refreshSilently)

    const intervalId = window.setInterval(refreshSilently, LIVE_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshSilently)
      window.removeEventListener(LIVE_UPDATE_EVENT, refreshSilently)
      document.removeEventListener('visibilitychange', refreshSilently)
      channel?.removeEventListener('message', refreshSilently)
      channel?.close()
    }
  }, [fetchData, url])

  const refetch = useCallback(() => fetchData(), [fetchData])

  return { data, loading, error, refetch, setData }
}
