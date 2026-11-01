import { invoke } from '@tauri-apps/api/core'
// Spiegel der Rust-Befehle in src-tauri/src/lib.rs.

export type Clipper = 'nvidia' | 'medal' | 'amd' | 'selfclip'

export interface Settings {
  autoStart: boolean
  clipper: Clipper
  clipperHotkey: string
  clipDir: string
  killClip?: KillClipConfig
  selfClip?: SelfClipConfig
}

export interface SelfClipConfig {
  bufferSeconds: number
  bitrateMbps: number
  fps: number
  audio: boolean
}

export interface SelfClipStatus {
  installed: boolean
  running: boolean
  encoder: string | null
  bufferedSeconds: number
  audioSource: string | null
  error: string | null
  downloadBytes: number
}

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface KillClipConfig {
  playerName: string
  useMarker: boolean
  killfeed: Region | null
  hitmarker: Region | null
  hitmarkerThreshold: number
  mergeSeconds: number
  preSeconds: number
  postSeconds: number
  replaySeconds: number
  deleteSource: boolean
}

export interface KillClipStatus {
  running: boolean
  phase: '' | 'idle' | 'watching' | 'saving' | 'rendering'
  pendingKills: number
  target: { channel: { name: string } | null; limitBytes: number; reason: string | null } | null
  lastFeed: string
  error: string | null
}

export interface KillClipEvent {
  kind: 'kill' | 'death' | 'rendered' | 'error' | 'warning'
  message: string
  link: string | null
  path: string | null
  at: number
}

/** Einrichtungstaste: erst `saving`, dann der gespeicherte Replay oder ein Fehler. */
export interface KillClipReferenceClip {
  saving?: boolean
  path?: string
  duration?: number
  error?: string
}

/** Ergebnis der Einrichtung: was die App rund um den markierten Kill gefunden hat. */
export interface KillClipReference {
  path: string
  markerPath: string | null
  width: number
  height: number
  at: number
  killfeed: Region | null
  victim: string | null
  line: string | null
  hitmarker: Region | null
  markerScore: number
}

export interface SettingsView {
  autostartAvailable: boolean
  autostartError: string | null
  settings: Settings
  defaultClipDir: string
  defaultClipperHotkey: string
}

export const backend = {
  getSettings: () => invoke<SettingsView>('get_settings'),
  saveSettings: (settings: Settings) => invoke<SettingsView>('save_settings', { settings }),
  openExternal: (url: string) => invoke<void>('open_external', { url }),
  selfClipStatus: () => invoke<SelfClipStatus>('selfclip_status'),
  selfClipInstall: () => invoke<SelfClipStatus>('selfclip_install'),
  selfClipSaveConfig: (config: SelfClipConfig) => invoke<SettingsView>('selfclip_save_config', { config }),
  selfClipRestart: () => invoke<void>('selfclip_restart'),
  killClipStatus: () => invoke<KillClipStatus>('killclip_status'),
  killClipStart: () => invoke<KillClipStatus>('killclip_start'),
  killClipStop: () => invoke<void>('killclip_stop'),
  killClipSaveConfig: (config: KillClipConfig) => invoke<SettingsView>('killclip_save_config', { config }),
  killClipCalibration: (active: boolean) => invoke<string>('killclip_calibration', { active }),
  killClipAnalyze: (path: string, at: number) => invoke<KillClipReference>('killclip_analyze', { path, at }),
  killClipReveal: (path?: string) => invoke<void>('killclip_reveal', { path: path ?? null }),
  killClipTestFeed: (region: Region) => invoke<{ lines: string[]; kills: string[]; deaths: string[] }>('killclip_test_feed', { region }),
  killClipTestMarker: () => invoke<number>('killclip_test_marker'),
  killClipSavedReference: () =>
    invoke<{ path: string; markerPath: string | null; width: number; height: number; hitmarker: Region } | null>('killclip_saved_reference'),

}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
