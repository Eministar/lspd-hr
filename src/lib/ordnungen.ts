export interface OrdnungConfig {
  id: string
  title: string
  description: string
  category: string
  buttonLabel: string
  file: string
  icon: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOrdnungConfig(value: unknown): value is OrdnungConfig {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.category === 'string' &&
    typeof value.buttonLabel === 'string' &&
    typeof value.file === 'string' &&
    typeof value.icon === 'string'
  )
}

export function normalizeOrdnungConfigs(parsed: unknown): OrdnungConfig[] {
  const entries = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && 'ordnungen' in parsed
      ? parsed.ordnungen
      : null

  return Array.isArray(entries) ? entries.filter(isOrdnungConfig) : []
}

