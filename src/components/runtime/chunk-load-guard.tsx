'use client'

import { useEffect } from 'react'

const RELOAD_KEY = 'lspd:last-chunk-reload'
const RELOAD_WINDOW_MS = 30_000

function isChunkLoadProblem(value: unknown) {
  if (!value) return false
  const text =
    value instanceof Error
      ? `${value.name} ${value.message} ${value.stack ?? ''}`
      : typeof value === 'string'
        ? value
        : JSON.stringify(value)

  return /ChunkLoadError|Loading chunk|Failed to load chunk|\/_next\/static\/chunks\//i.test(text)
}

function reloadOnce(reason: string) {
  const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || '0')
  if (Date.now() - lastReload < RELOAD_WINDOW_MS) return

  sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  fetch('/api/runtime-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Chunk neu geladen',
      message: reason,
      path: window.location.pathname,
    }),
    keepalive: true,
  }).catch(() => {})

  window.location.reload()
}

export function ChunkLoadGuard() {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadProblem(event.reason)) {
        event.preventDefault()
        reloadOnce('Ein alter Next.js Chunk konnte nach einem neuen Build nicht geladen werden.')
      }
    }

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadProblem(event.error) || isChunkLoadProblem(event.message)) {
        reloadOnce('Ein Script-Chunk konnte nicht geladen werden.')
      }
    }

    window.addEventListener('unhandledrejection', onUnhandledRejection)
    window.addEventListener('error', onError)

    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
      window.removeEventListener('error', onError)
    }
  }, [])

  return null
}
