'use client'

import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { LIVE_REFRESH_INTERVAL_MS, LIVE_UPDATE_CHANNEL, LIVE_UPDATE_EVENT } from '@/lib/live-updates'

interface UseFetchResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  setData: Dispatch<SetStateAction<T | null>>
}

export function useFetch<T>(url: string | null): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    if (!url) {
      setLoading(false)
      setData(null)
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
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Fehler beim Laden')
      }
      if (requestIdRef.current === requestId) {
        setData(json.data)
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
      if (document.visibilityState === 'visible') {
        void fetchData({ silent: true })
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchData({ silent: true })
      }
    }

    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(LIVE_UPDATE_CHANNEL) : null

    window.addEventListener('focus', refreshSilently)
    window.addEventListener(LIVE_UPDATE_EVENT, refreshSilently)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    channel?.addEventListener('message', refreshSilently)

    const intervalId = window.setInterval(refreshSilently, LIVE_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshSilently)
      window.removeEventListener(LIVE_UPDATE_EVENT, refreshSilently)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      channel?.removeEventListener('message', refreshSilently)
      channel?.close()
    }
  }, [fetchData, url])

  const refetch = useCallback(() => fetchData(), [fetchData])

  return { data, loading, error, refetch, setData }
}
