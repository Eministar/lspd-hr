import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { error, success, unauthorized } from '@/lib/api-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.pdf', '.txt', '.csv', '.json', '.zip',
])

function configuredKey() {
  return process.env.UPLOAD_API_KEY?.trim() || ''
}

function maxBytes() {
  const raw = Number.parseInt(process.env.UPLOAD_MAX_BYTES || '', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_BYTES
}

function checkApiKey(req: NextRequest) {
  const expected = configuredKey()
  if (!expected) return false
  const header = req.headers.get('x-api-key')?.trim()
    || (req.headers.get('authorization')?.trim().replace(/^Bearer\s+/i, '') ?? '')
  return header === expected
}

function sanitizeExt(name: string) {
  const ext = path.extname(name).toLowerCase()
  if (!ext || ext.length > 10) return ''
  return ext
}

export async function POST(req: NextRequest) {
  if (!configuredKey()) return error('Upload-API ist nicht konfiguriert (UPLOAD_API_KEY fehlt)', 503)
  if (!checkApiKey(req)) return unauthorized()

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return error('Multipart/Form-Data wird benötigt', 400)
  }

  const file = form.get('file')
  if (!(file instanceof File)) return error('Feld "file" fehlt', 400)
  if (file.size === 0) return error('Datei ist leer', 400)
  if (file.size > maxBytes()) return error(`Datei zu groß (max. ${maxBytes()} Bytes)`, 413)

  const ext = sanitizeExt(file.name)
  if (!ext || !ALLOWED_EXT.has(ext)) return error('Dateityp nicht erlaubt', 415)

  const id = randomUUID()
  const filename = `${id}${ext}`
  const dir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(dir, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(dir, filename), buffer)

  const url = `/uploads/${filename}`
  return success({
    id,
    filename,
    originalName: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    url,
  }, 201)
}
