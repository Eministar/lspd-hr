/**
 * Plesk / ähnliche Hosts erwarten beim Start oft eine konkrete .js-Datei
 * (stellweise als „Application Startup File“ vorgefüllt: server.js).
 * Next.js liefert kein Passenger/Express‑server.js – nur die CLI „next start“.
 *
 * Hier: gleicher Produktionsstart wie `next start`, aber als Node-Einstieg für Plesk.
 * Siehe: https://tenbyte.de/blog/run-next-js-15-and-16-on-plesk-with-nodejs
 */

process.env.NODE_ENV = 'production'

const { nextStart } = require('next/dist/cli/next-start')

const port = Number.parseInt(process.env.PORT ?? '3000', 10)

// Nur `port` — auf Linux ist `process.env.HOSTNAME` oft der Servername (nicht 0.0.0.0).
nextStart({ port }).catch((err) => {
  console.error(err)
  process.exit(1)
})
