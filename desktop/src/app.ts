import { getVersion } from '@tauri-apps/api/app'
import { open } from '@tauri-apps/plugin-dialog'
import { backend, type Clipper, type Settings, type SettingsView } from './backend'
import { $, errorText, selectValue, showMessage, type DropdownElement } from './dom'
import { displayHotkey } from './format'
import { hotkeyInput } from './hotkey-input'
import { renderIcons } from './icons'
import { initSelfClip, renderSelfClip } from './pages/selfclip'
import { initKillClips, showKillClips } from './pages/killclips'
import { notifyStateChange, state, type Route } from './store'

type ValueElement = HTMLElement & { value: string }
type DialogElement = HTMLElement & { show(): void; hide(): void }

function go(next: Route) {
  for (const item of document.querySelectorAll<HTMLElement>('.nav-item[data-route]')) {
    if (item.dataset.route === next) item.setAttribute('aria-current', 'page')
    else item.removeAttribute('aria-current')
  }
  for (const page of document.querySelectorAll<HTMLElement>('.page')) page.hidden = page.dataset.page !== next
  $('content').scrollTop = 0
  if (next === 'killclips') showKillClips()
}

// ── Einstellungen ────────────────────────────────────────────────────

const clipperHotkey = hotkeyInput($<ValueElement>('s-clipper-hotkey'), {
  optional: true,
  placeholder: () => `Standard: ${displayHotkey(state.settings?.defaultClipperHotkey ?? '')}`,
  onChange: (hotkey) => updateSettings({ clipperHotkey: hotkey }),
})

function renderSettings(view: SettingsView) {
  state.settings = view
  const { settings } = view
  const autoStart = $('s-auto-start') as HTMLElement & { checked: boolean; disabled: boolean }
  autoStart.checked = settings.autoStart
  autoStart.disabled = !view.autostartAvailable
  $('s-auto-start-note').textContent = view.autostartError ?? (view.autostartAvailable
    ? 'Öffnet LSPD Kill-Clips automatisch, sobald du dich bei Windows anmeldest.'
    : 'In der installierten App verfügbar. Entwicklungsstarts ändern den Windows-Autostart nicht.')
  selectValue($<DropdownElement>('s-clipper'), settings.clipper)
  clipperHotkey.set(settings.clipperHotkey)
  $('s-clip-dir-label').textContent = settings.clipDir || `${view.defaultClipDir} (Standard)`
  $('s-clip-dir-label').title = settings.clipDir || view.defaultClipDir
  $('s-clip-dir-reset').hidden = !settings.clipDir
  renderSelfClip()
  notifyStateChange()
}

async function updateSettings(patch: Partial<Settings>) {
  if (!state.settings) return
  try {
    renderSettings(await backend.saveSettings({ ...state.settings.settings, ...patch }))
    showMessage('settings-error', null)
  } catch (error) {
    showMessage('settings-error', errorText(error))
    renderSettings(state.settings)
  }
}

function bindSettings() {
  const dialog = $<DialogElement>('settings-dialog')
  $('nav-settings').addEventListener('click', () => dialog.show())
  $('s-auto-start').addEventListener('change', async () => {
    const control = $('s-auto-start') as HTMLElement & { checked: boolean; disabled: boolean }
    if (!state.settings?.autostartAvailable || control.checked === state.settings.settings.autoStart) return
    control.disabled = true
    await updateSettings({ autoStart: control.checked })
  })
  $('s-clipper').addEventListener('change', () => {
    const clipper = $<DropdownElement>('s-clipper').value as Clipper | null
    // Ordner und Taste gehören zum jeweiligen Programm – beim Wechsel auf dessen Standard.
    if (clipper && clipper !== state.settings?.settings.clipper) void updateSettings({ clipper, clipDir: '', clipperHotkey: '' })
  })
  $('s-clip-dir-browse').addEventListener('click', async () => {
    const current = state.settings
    const dir = await open({ directory: true, defaultPath: current?.settings.clipDir || current?.defaultClipDir })
    if (typeof dir === 'string') void updateSettings({ clipDir: dir })
  })
  $('s-clip-dir-reset').addEventListener('click', () => updateSettings({ clipDir: '' }))
}

// ── Start ────────────────────────────────────────────────────────────

export async function startApp() {
  renderIcons()
  for (const item of document.querySelectorAll<HTMLElement>('.nav-item[data-route]')) {
    item.addEventListener('click', () => go(item.dataset.route as Route))
  }
  bindSettings()
  initKillClips()
  initSelfClip()
  $('kc-folder-top').addEventListener('click', () => $('kc-folder').click())
  void getVersion().then((version) => { $('version').textContent = `v${version}` }).catch(() => {})

  renderSettings(await backend.getSettings())
  go('killclips')
}
