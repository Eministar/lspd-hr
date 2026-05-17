import { readFile, stat } from 'node:fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { resolveUploadPath } from '@/lib/uploads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTENT_TYPES: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  webp: 'image/webp',
  zip: 'application/zip',
}

function contentType(filename: string) {
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[extension] ?? 'application/octet-stream'
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params

  let target: string
  try {
    target = resolveUploadPath(filename)
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const [file, fileStat] = await Promise.all([
      readFile(/*turbopackIgnore: true*/ target),
      stat(/*turbopackIgnore: true*/ target),
    ])

    return new NextResponse(file, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(fileStat.size),
        'Content-Type': contentType(filename),
        'Last-Modified': fileStat.mtime.toUTCString(),
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
