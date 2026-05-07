import { NextRequest } from 'next/server'
import { error, success, unauthorized } from '@/lib/api-response'
import { saveUploadedFile, validateUploadFile } from '@/lib/uploads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function configuredKey() {
  return process.env.UPLOAD_API_KEY?.trim() || ''
}

function checkApiKey(req: NextRequest) {
  const expected = configuredKey()
  if (!expected) return false
  const header = req.headers.get('x-api-key')?.trim()
    || (req.headers.get('authorization')?.trim().replace(/^Bearer\s+/i, '') ?? '')
  return header === expected
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

  const validationError = validateUploadFile(file)
  if (validationError) {
    const status = validationError.includes('leer') ? 400 : validationError.includes('zu groß') ? 413 : 415
    return error(validationError, status)
  }

  return success(await saveUploadedFile(file), 201)
}
