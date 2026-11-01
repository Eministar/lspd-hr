import type { SettingsView } from './backend'

export type Route = 'killclips' | 'about'

/** Gemeinsamer Zustand der Seiten; gesetzt vom App-Gerüst (app.ts). */
export const state: { settings: SettingsView | null } = {
  settings: null,
}

type Listener = () => void
const listeners = new Set<Listener>()

export function onStateChange(listener: Listener) {
  listeners.add(listener)
}

export function notifyStateChange() {
  for (const listener of listeners) listener()
}
