'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  username: string
  displayName: string
  role: string
  group: { id: string; name: string } | null
  permissions: string[]
}

interface AuthContextType {
  user: User | null
  loading: boolean
  authError: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  clearClientCache: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const router = useRouter()

  const refreshUser = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Sitzung konnte nicht geprüft werden')
      }

      setUser(data.data)
      setAuthError(null)
    } catch (err) {
      setUser(null)
      setAuthError(err instanceof Error ? err.message : 'Sitzung konnte nicht geprüft werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshUser()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [refreshUser])

  const login = async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Login fehlgeschlagen')
    setUser(data.data.user)
    setAuthError(null)
    router.push('/')
  }

  const logout = async () => {
    await fetch('/api/auth/login', { method: 'DELETE' })
    setUser(null)
    setAuthError(null)
    router.push('/login')
  }

  const clearClientCache = async () => {
    await fetch('/api/auth/login', { method: 'DELETE' }).catch(() => undefined)

    if (typeof window !== 'undefined') {
      window.localStorage.clear()
      window.sessionStorage.clear()

      if ('caches' in window) {
        const cacheNames = await window.caches.keys()
        await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
      }
    }

    setUser(null)
    setAuthError(null)
    router.push('/login')
    router.refresh()
  }

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, logout, refreshUser, clearClientCache }}>
      {children}
    </AuthContext.Provider>
  )
}
