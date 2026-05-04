import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const configPath = path.join(process.cwd(), 'ordnungen', 'config.json')
    const data = await fs.readFile(configPath, 'utf8')
    const config = JSON.parse(data)
    return NextResponse.json(config.ordnungen)
  } catch (error) {
    console.error('Error loading ordnungen config:', error)
    return NextResponse.json({ error: 'Failed to load ordnungen config' }, { status: 500 })
  }
}

