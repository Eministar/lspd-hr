/**
 * Hosts (Plesk, IIS/iisnode, …) erwarten oft eine konkrete .js-Datei als Einstieg.
 * Next.js liefert kein Express‑`server.js` – hier: gleicher Start wie `next start`.
 *
 * Port: `process.env.PORT` darf auf Windows/iisnode leer (`""`) sein — `parseInt("", 10)` → NaN → ERR_SOCKET_BAD_PORT.
 * Dann greift ein numerischer Fallback; unter IIS ggf. in web.config eine **Zahl** für PORT setzen.
 */

process.env.NODE_ENV = 'production'

const path = require('node:path')
const { nextStart } = require('next/dist/cli/next-start')

function resolvePort() {
  const raw = process.env.PORT
  if (raw === undefined || raw === null) return 3000
  const trimmed = String(raw).trim()
  if (trimmed === '') return 3000
  const n = Number.parseInt(trimmed, 10)
  if (Number.isFinite(n) && n >= 0 && n < 65536) return n
  console.warn(
    '[start.js] PORT ist keine gültige TCP-Portnummer (0–65535):',
    String(raw).slice(0, 120),
    '— nutze 3000. Unter IIS/iisnode in web.config / Umgebungsvariablen PORT numerisch setzen.',
  )
  return 3000
}

const port = resolvePort()
process.env.PORT = String(port)

// Zweites Argument = Projektroot: Plesk startet Node oft mit falschem `cwd`, dann findet
// Next die `.next`-Build nicht → 404 für `/_next/static/...`.
const projectDir = path.resolve(__dirname)

nextStart({ port }, projectDir).catch((err) => {
  console.error(err)
  process.exit(1)
})
