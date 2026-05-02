'use client'

import { useState, useCallback } from 'react'
import { notifyLiveUpdate } from '@/lib/live-updates'

interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  execute: (url: string, options?: RequestInit) => Promise<T | null>
}

export function useApi<T = unknown>(): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(async (url: string, options?: RequestInit): Promise<T | null> => {
    setLoading(true)
    setError(null)
    try {
      const method = options?.method?.toUpperCase() ?? 'GET'
      const res = await fetch(url, {
        ...options,
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Fehler bei der Anfrage')
      }
      if (method !== 'GET' && method !== 'HEAD') {
        notifyLiveUpdate()
      }
      setData(json.data)
      return json.data
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
      setError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, execute }
}
