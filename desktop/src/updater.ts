import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { $ } from './dom'
import { formatBytes } from './format'

// Updates kommen vom LSPD-Dashboard (/api/desktop/updates/latest.json), gebaut vom
// Workflow .github/workflows/desktop.yml. Beim Start wird sofort installiert, im
// laufenden Betrieb nur geladen – installiert wird beim Klick oder beim nächsten Start.

const CHECK_INTERVAL_MS = 10 * 60 * 1000
const STARTUP_TIMEOUT_MS = 6000

let running = false
let ready: Update | null = null

function setStatus(text: string) {
  $('update-status').textContent = text
}

function showBanner(text: string, canRestart: boolean) {
  $('update-banner').hidden = false
  $('update-banner-text').textContent = text
  $('update-restart').hidden = !canRestart
}

function progress(onText: (text: string) => void) {
  let total = 0
  let loaded = 0
  return (event: DownloadEvent) => {
    if (event.event === 'Started') total = event.data.contentLength ?? 0
    if (event.event === 'Progress') loaded += event.data.chunkLength
    onText(total > 0 ? `${formatBytes(loaded)} von ${formatBytes(total)}` : formatBytes(loaded))
  }
}

async function installNow(update: Update) {
  showBanner(`Update auf Version ${update.version} wird installiert – die App startet gleich neu …`, false)
  await update.install()
  await relaunch()
}

/** Sucht nach einer neuen Version. `atStartup`: direkt installieren, sonst nur laden. */
async function runCheck(atStartup: boolean) {
  if (running || ready) return
  running = true
  setStatus('Suche nach Updates …')
  try {
    const update = await (atStartup
      ? Promise.race([check(), new Promise<null>((resolve) => setTimeout(() => resolve(null), STARTUP_TIMEOUT_MS))])
      : check())
    if (!update) {
      setStatus('Auf dem neuesten Stand')
      return
    }
    showBanner(`Version ${update.version} wird geladen …`, false)
    await update.download(progress((text) => showBanner(`Version ${update.version} wird geladen · ${text}`, false)))
    ready = update
    if (atStartup) return await installNow(update)
    setStatus(`Version ${update.version} ist bereit`)
    showBanner(`Version ${update.version} ist bereit. Wird beim nächsten Start installiert.`, true)
  } catch (error) {
    // Kein Server, offline oder lokaler Entwicklungsstart: einfach weiterarbeiten.
    console.warn('Update-Prüfung fehlgeschlagen:', error)
    setStatus('Update-Server nicht erreichbar')
    if (!ready) $('update-banner').hidden = true
  } finally {
    running = false
  }
}

export function startAutoUpdates() {
  $('update-restart').addEventListener('click', () => {
    if (ready) void installNow(ready).catch((error) => showBanner(`Update fehlgeschlagen: ${String(error)}`, false))
  })
  $('update-check').addEventListener('click', () => void runCheck(false))
  void runCheck(true)
  setInterval(() => void runCheck(false), CHECK_INTERVAL_MS)
}
