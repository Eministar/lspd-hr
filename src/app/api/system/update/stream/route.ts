import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getRecentLogs, subscribe, getState } from '@/lib/updater'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized' || msg === 'Forbidden') {
      return new Response(`event: error\ndata: ${msg}\n\n`, {
        status: msg === 'Unauthorized' ? 401 : 403,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    throw e
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // Initialer State
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      send('state', getState())
      for (const line of getRecentLogs()) {
        controller.enqueue(encoder.encode(`event: log\ndata: ${JSON.stringify(line)}\n\n`))
      }

      const unsubscribe = subscribe(({ type, payload }) => {
        try {
          send(type, payload)
        } catch {
          // controller closed
        }
      })

      // Heartbeat alle 15s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 15_000)

      // Cleanup wenn Client disconnect
      const onAbort = () => {
        clearInterval(heartbeat)
        unsubscribe()
        try { controller.close() } catch { /* */ }
      }
      req.signal.addEventListener('abort', onAbort)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
