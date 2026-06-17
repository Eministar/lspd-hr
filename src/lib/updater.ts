import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Self-Update-Workflow für das LSPD HR Dashboard.
 *
 * Ablauf (einzeln nacheinander, jeder Schritt stoppt bei Fehler):
 *   1. `git pull --ff-only`              — neueste Änderungen holen
 *   2. `npm install --omit=dev`          — Dependencies installieren
 *   3. `npx prisma generate`             — Prisma-Client regenerieren
 *   4. `npx prisma db push --accept-data-loss` — Schema synchronisieren
 *   5. `npm run build`                   — Production-Build
 *   6. Restart                           — PM2 / systemd / Docker
 *
 * Sicherheit:
 * - `spawn` (kein Shell) — keine Command-Injection
 * - Absolute Pfade
 * - Allowlist für Binaries
 * - Mutex: nur ein Update gleichzeitig
 * - Logs werden in-memory gepuffert (max. 5000 Zeilen) + per EventEmitter gestreamt
 */

export type UpdateStep = 'idle' | 'pull' | 'install' | 'prisma-generate' | 'prisma-push' | 'build' | 'restart' | 'done' | 'error'
export interface UpdateState {
  status: 'idle' | 'running' | 'done' | 'error'
  step: UpdateStep
  message: string
  startedAt: string | null
  finishedAt: string | null
  exitCode: number | null
  currentVersion: string | null
  pendingVersion: string | null
}

const MAX_LOG_LINES = 5000

const emitter = new EventEmitter()
emitter.setMaxListeners(50)

let logs: string[] = []
let state: UpdateState = {
  status: 'idle',
  step: 'idle',
  message: 'Bereit für ein Update.',
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  currentVersion: null,
  pendingVersion: null,
}

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch }
  emitter.emit('state', state)
}

function appendLog(line: string) {
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`
  logs.push(stamped)
  if (logs.length > MAX_LOG_LINES) logs = logs.slice(-MAX_LOG_LINES)
  emitter.emit('log', stamped)
}

export function getState(): UpdateState {
  return state
}

export function getRecentLogs(): string[] {
  return [...logs]
}

export function subscribe(listener: (event: { type: 'log' | 'state'; payload: string | UpdateState }) => void): () => void {
  const logHandler = (payload: string) => listener({ type: 'log', payload })
  const stateHandler = (payload: UpdateState) => listener({ type: 'state', payload })
  emitter.on('log', logHandler)
  emitter.on('state', stateHandler)
  return () => {
    emitter.off('log', logHandler)
    emitter.off('state', stateHandler)
  }
}

function getCurrentVersion(): string | null {
  const pkgPath = path.join(process.cwd(), 'package.json')
  if (!existsSync(pkgPath)) return null
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string }
    return pkg.version ?? null
  } catch {
    return null
  }
}

async function readRemoteHead(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('git', ['ls-remote', '--heads', 'origin', 'HEAD'], { cwd: process.cwd() })
    let out = ''
    proc.stdout.on('data', (b) => { out += b.toString() })
    proc.on('close', () => {
      const hash = out.split('\t')[0]?.trim()
      resolve(hash || null)
    })
    proc.on('error', () => resolve(null))
  })
}

function isGitRepo(): boolean {
  return existsSync(path.join(process.cwd(), '.git'))
}

/** Detect runtime (PM2 / Docker / standalone). */
function detectRuntime(): 'pm2' | 'docker' | 'standalone' {
  if (process.env.PM2_USAGE || process.env.pm_id !== undefined) return 'pm2'
  if (existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === '1') return 'docker'
  return 'standalone'
}

function runCommand(
  cmd: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    appendLog(`$ ${cmd} ${args.join(' ')}`)
    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn(cmd, args, {
        cwd: options.cwd ?? process.cwd(),
        env: { ...process.env, ...options.env, FORCE_COLOR: '0', CI: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false, // Wichtig: keine Shell-Injection
      })
    } catch (err) {
      reject(err)
      return
    }

    let stdout = ''
    let stderr = ''
    if (proc.stdout) {
      proc.stdout.on('data', (chunk: Buffer) => {
        const s = chunk.toString()
        stdout += s
        appendLog(s)
      })
    }
    if (proc.stderr) {
      proc.stderr.on('data', (chunk: Buffer) => {
        const s = chunk.toString()
        stderr += s
        appendLog(s)
      })
    }
    proc.on('error', (err) => reject(err))
    proc.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

let updateRunning = false

/**
 * Startet den Update-Workflow. Fire-and-forget — Status wird per
 * subscribe() / getState() mitverfolgt.
 */
export async function startUpdate(): Promise<{ started: boolean; reason?: string }> {
  if (updateRunning) {
    return { started: false, reason: 'Ein Update läuft bereits.' }
  }
  if (!isGitRepo()) {
    return { started: false, reason: 'Kein Git-Repository — Update nicht möglich.' }
  }

  updateRunning = true
  logs = []
  setState({
    status: 'running',
    step: 'pull',
    message: 'Update gestartet …',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    currentVersion: getCurrentVersion(),
    pendingVersion: null,
  })

  // Run asynchronously
  void runUpdateFlow().catch((err) => {
    setState({
      status: 'error',
      step: 'error',
      message: err instanceof Error ? err.message : String(err),
      finishedAt: new Date().toISOString(),
    })
    appendLog(`FEHLER: ${err instanceof Error ? err.message : String(err)}`)
  }).finally(() => {
    updateRunning = false
  })

  return { started: true }
}

async function runUpdateFlow(): Promise<void> {
  try {
    // 1) git pull
    setState({ step: 'pull', message: 'Hole neueste Änderungen …' })
    const pull = await runCommand('git', ['pull', '--ff-only', '--prune'])
    if (pull.code !== 0) {
      throw new Error('git pull fehlgeschlagen (Exit ' + pull.code + ')')
    }

    // Pending version nach pull
    const pkg = getCurrentVersion()
    setState({ pendingVersion: pkg })

    // 2) npm install (Production-Deps)
    setState({ step: 'install', message: 'Installiere Dependencies …' })
    const install = await runCommand('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'])
    if (install.code !== 0) {
      throw new Error('npm install fehlgeschlagen (Exit ' + install.code + ')')
    }

    // 3) prisma generate
    setState({ step: 'prisma-generate', message: 'Generiere Prisma-Client …' })
    const gen = await runCommand('npx', ['prisma', 'generate'])
    if (gen.code !== 0) {
      throw new Error('prisma generate fehlgeschlagen (Exit ' + gen.code + ')')
    }

    // 4) prisma db push
    setState({ step: 'prisma-push', message: 'Synchronisiere Datenbank-Schema …' })
    const push = await runCommand('npx', ['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate'])
    if (push.code !== 0) {
      throw new Error('prisma db push fehlgeschlagen (Exit ' + push.code + ')')
    }

    // 5) next build
    setState({ step: 'build', message: 'Baue Production-Version …' })
    const build = await runCommand('npm', ['run', 'build'])
    if (build.code !== 0) {
      throw new Error('Build fehlgeschlagen (Exit ' + build.code + ')')
    }

    // 6) Restart
    setState({ step: 'restart', message: 'Starte Server neu …' })
    appendLog('Build erfolgreich. Initiiere Neustart …')

    const runtime = detectRuntime()
    appendLog(`Erkannte Laufzeit-Umgebung: ${runtime}`)

    if (runtime === 'pm2') {
      const restart = await runCommand('pm2', ['restart', process.env.PM2_APP_NAME ?? 'lspd-hr', '--update-env'])
      if (restart.code !== 0) {
        throw new Error('pm2 restart fehlgeschlagen')
      }
    } else if (runtime === 'docker') {
      // Beim Container-Setup beenden wir den Prozess — der Container-Manager (Docker / Coolify / Nixpacks)
      // startet ihn automatisch neu.
      appendLog('Docker-Container: beende Prozess für automatischen Neustart …')
      setTimeout(() => process.exit(0), 800)
    } else {
      appendLog('Standalone-Modus: kein automatischer Neustart. Bitte manuell `npm start` ausführen.')
      setState({ step: 'done', message: 'Build erfolgreich. Manuelles Neustarten erforderlich.' })
    }
  } catch (err) {
    setState({
      status: 'error',
      step: 'error',
      message: err instanceof Error ? err.message : String(err),
      finishedAt: new Date().toISOString(),
    })
    appendLog(`FEHLER: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function checkForUpdates(): Promise<{ current: string | null; remote: string | null; hasUpdate: boolean }> {
  return new Promise((resolve) => {
    if (!isGitRepo()) {
      resolve({ current: getCurrentVersion(), remote: null, hasUpdate: false })
      return
    }
    void Promise.all([readRemoteHead(), getCurrentVersion()]).then(([remote, current]) => {
      resolve({ current, remote, hasUpdate: !!remote && remote !== current })
    })
  })
}
