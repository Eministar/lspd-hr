/**
 * Plesk / ähnliche Hosts erwarten beim Start oft eine konkrete .js-Datei
 * (stellweise als „Application Startup File“ vorgefüllt: server.js).
 * Next.js liefert kein Passenger/Express‑server.js – nur die CLI „next start“.
 *
 * Hier: gleicher Produktionsstart wie `next start`, aber als Node-Einstieg für Plesk.
 * Siehe: https://tenbyte.de/blog/run-next-js-15-and-16-on-plesk-with-nodejs
 */

process.env.NODE_ENV = 'production'

const path = require('node:path')
const { nextStart } = require('next/dist/cli/next-start')

const port = Number.parseInt(process.env.PORT ?? '3000', 10)

// Zweites Argument = Projektroot: Plesk startet Node oft mit falschem `cwd`, dann findet
// Next die `.next`-Build nicht → 404 für `/_next/static/...`.
const projectDir = path.resolve(__dirname)

nextStart({ port }, projectDir).catch((err) => {
  console.error(err)
  process.exit(1)
})
