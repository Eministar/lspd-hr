import { promises as fs } from 'fs'
import path from 'path'
import { success, error as apiError } from '@/lib/api-response'
import { normalizeOrdnungConfigs } from '@/lib/ordnungen'

export async function GET() {
  try {
    const configPath = path.join(process.cwd(), 'ordnungen', 'config.json')
    const data = await fs.readFile(configPath, 'utf8')
    const parsed: unknown = JSON.parse(data)
    const configs = normalizeOrdnungConfigs(parsed)

    return success(configs)
  } catch (error) {
    console.error('Error loading ordnungen config:', error)
    return apiError('Failed to load ordnungen config', 500)
  }
}

