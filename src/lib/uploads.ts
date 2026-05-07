import { randomUUID } from 'node:crypto'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024

const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.pdf', '.txt', '.csv', '.json', '.zip',
])

export interface UploadedFileInfo {
  id: string
  filename: string
  originalName: string
  size: number
  mimeType: string
  url: string
}

export interface StoredUploadInfo {
  filename: string
  url: string
  size: number
  extension: string
  modifiedAt: string
}

export function uploadMaxBytes() {
  const raw = Number.parseInt(process.env.UPLOAD_MAX_BYTES || '', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_UPLOAD_MAX_BYTES
}

function uploadDir() {
  return path.join(process.cwd(), 'public', 'uploads')
}

function sanitizeExt(name: string) {
  const ext = path.extname(name).toLowerCase()
  if (!ext || ext.length > 10) return ''
  return ext
}

function isStoredUploadFilename(filename: string) {
  const clean = path.basename(filename)
  if (clean !== filename) return false
  const ext = sanitizeExt(filename)
  if (!ext || !ALLOWED_EXT.has(ext)) return false
  return /^[a-zA-Z0-9._-]+$/.test(filename)
}

export function validateUploadFile(file: File) {
  if (file.size === 0) return 'Datei ist leer'
  if (file.size > uploadMaxBytes()) return `Datei zu groß (max. ${uploadMaxBytes()} Bytes)`

  const ext = sanitizeExt(file.name)
  if (!ext || !ALLOWED_EXT.has(ext)) return 'Dateityp nicht erlaubt'

  return null
}

export async function saveUploadedFile(file: File): Promise<UploadedFileInfo> {
  const validationError = validateUploadFile(file)
  if (validationError) throw new Error(validationError)

  const ext = sanitizeExt(file.name)
  const id = randomUUID()
  const filename = `${id}${ext}`
  const dir = uploadDir()
  await mkdir(dir, { recursive: true })

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(dir, filename), buffer)

  return {
    id,
    filename,
    originalName: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    url: `/uploads/${filename}`,
  }
}

export async function listUploadedFiles(): Promise<StoredUploadInfo[]> {
  const dir = uploadDir()
  await mkdir(dir, { recursive: true })

  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isStoredUploadFilename(entry.name))
      .map(async (entry) => {
        const fileStat = await stat(path.join(dir, entry.name))
        return {
          filename: entry.name,
          url: `/uploads/${entry.name}`,
          size: fileStat.size,
          extension: sanitizeExt(entry.name).replace('.', '').toUpperCase(),
          modifiedAt: fileStat.mtime.toISOString(),
        }
      }),
  )

  return files.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))
}

export async function deleteUploadedFile(filename: string) {
  if (!isStoredUploadFilename(filename)) throw new Error('Dateiname ist ungültig')

  const target = path.resolve(uploadDir(), filename)
  const base = path.resolve(uploadDir())
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error('Dateiname ist ungültig')

  await unlink(target)
}
