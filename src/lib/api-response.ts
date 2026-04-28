import { NextResponse } from 'next/server'

export function success<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status })
}

export function error(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export function unauthorized() {
  return error('Nicht autorisiert', 401)
}

export function forbidden() {
  return error('Keine Berechtigung', 403)
}

export function notFound(entity = 'Ressource') {
  return error(`${entity} nicht gefunden`, 404)
}
