import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { error, success, unauthorized } from '@/lib/api-response'
import { saveUploadedFile, validateUploadFile } from '@/lib/uploads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authError(e: unknown) {
  const msg = e instanceof Error ? e.message : 'Serverfehler'
  if (msg === 'Unauthorized') return unauthorized()
  if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
  return error(msg, 500)
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission('press:manage')

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return error('Multipart/Form-Data wird benötigt', 400)
    }

    const file = form.get('file')
    if (!(file instanceof File)) return error('Feld "file" fehlt', 400)
    if (!file.type.startsWith('image/')) return error('Nur Bilddateien sind erlaubt', 415)

    const validationError = validateUploadFile(file)
    if (validationError) {
      const status = validationError.includes('leer') ? 400 : validationError.includes('zu groß') ? 413 : 415
      return error(validationError, status)
    }

    return success(await saveUploadedFile(file), 201)
  } catch (e: unknown) {
    return authError(e)
  }
}
