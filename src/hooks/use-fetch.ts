'use client'

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'

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

  const fetchData = useCallback(async () => {
    if (!url) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Fehler beim Laden')
      }
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData, setData }
}
