/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Einstieg für Hosts wie Plesk (Linux), IIS/iisnode (Windows) usw.
 *
 * iisnode setzt PROCESS.env.PORT auf eine Windows-*Named Pipe* (\\.\pipe\...).
 * Diese MUSS direkt an http.Server.listen(pipe) übergeben werden — NICHT auf TCP 3000
 * ausweichen (sonst wartet IIS an der Pipe, Node lauscht woanders → 500er).
 */

process.env.NODE_ENV = 'production'

const path = require('node:path')
const http = require('node:http')
const { parse } = require('node:url')
const { spawnSync } = require('node:child_process')

const projectDir = path.resolve(__dirname)

/**
 * @returns {{ mode: 'pipe', target: string } | { mode: 'tcp', port: number }}
 */
function resolveListenTargetFromEnv() {
  const raw = process.env.PORT
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { mode: 'tcp', port: 3000 }
  }
  const s = String(raw).trim()
  if (/^\d+$/.test(s)) {
    const n = Number.parseInt(s, 10)
    if (Number.isFinite(n) && n >= 0 && n < 65536) {
      return { mode: 'tcp', port: n }
    }
  }
  return { mode: 'pipe', target: s }
}

async function startWithIisnodePipe(pipePath) {
  const next = require('next')

  const app = next({
    dev: false,
    dir: projectDir,
  })

  await app.prepare()
  const handle = app.getRequestHandler()

  await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const parsedUrl = parse(req.url, true)
        Promise.resolve(handle(req, res, parsedUrl)).catch((e) => {
          console.error(e)
          if (!res.headersSent) res.statusCode = 500
          res.end('Internal Server Error')
        })
      } catch (e) {
        console.error(e)
        if (!res.headersSent) res.statusCode = 500
        res.end('Internal Server Error')
      }
    })

    server.once('error', reject)
    server.listen(pipePath, () => resolve(undefined))
  })
}

async function startWithTcpPort(portNum) {
  process.env.PORT = String(portNum)
  const { nextStart } = require('next/dist/cli/next-start')

  await nextStart({ port: portNum }, projectDir)
}

async function main() {
  for (const step of [
    { command: 'npm', args: ['run', 'db:backup'] },
    { command: 'npx', args: ['prisma', 'db', 'push'] },
    { command: 'npx', args: ['prisma', 'generate'] },
  ]) {
    const result = spawnSync(step.command, step.args, {
      cwd: projectDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    })
    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
  }

  const lt = resolveListenTargetFromEnv()
  if (lt.mode === 'pipe') {
    await startWithIisnodePipe(lt.target)
    return
  }
  await startWithTcpPort(lt.port)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
