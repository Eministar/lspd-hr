import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { error, success, unauthorized } from '@/lib/api-response'
import { deleteUploadedFile, listUploadedFiles, saveUploadedFile, validateUploadFile } from '@/lib/uploads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function uploadErrorStatus(message: string) {
  if (message.includes('leer')) return 400
  if (message.includes('zu groß')) return 413
  return 415
}

async function requireUploadAdmin() {
  return requireAuth(['ADMIN'], ['settings:manage'])
}

export async function GET() {
  try {
    await requireUploadAdmin()
    return success(await listUploadedFiles())
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUploadAdmin()

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return error('Multipart/Form-Data wird benötigt', 400)
    }

    const file = form.get('file')
    if (!(file instanceof File)) return error('Feld "file" fehlt', 400)

    const validationError = validateUploadFile(file)
    if (validationError) return error(validationError, uploadErrorStatus(validationError))

    return success(await saveUploadedFile(file), 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUploadAdmin()

    const body = await req.json().catch(() => ({})) as { filename?: unknown }
    if (typeof body.filename !== 'string' || !body.filename.trim()) return error('Dateiname ist erforderlich')

    await deleteUploadedFile(body.filename.trim())
    return success({ message: 'Upload gelöscht' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    if (msg.includes('ENOENT')) return error('Upload nicht gefunden', 404)
    return error(msg, 500)
  }
}
