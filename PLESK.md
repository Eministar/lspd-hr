# Hosting auf Plesk (Node.js)

Die Windows-Deploy-Skripte (`deploy.bat` / `deploy.ps1`) sind nur für deinen lokalen Rechner. Auf dem Plesk-Server (Linux) läuft alles über **npm** und die **Plesk Node.js**-Integration.

## Warum `npm start` nur noch `next start` ist

Ein typischer Plesk-Prozess startet die App bei jedem Deploy und bei Problemen **neu**. Das alte `start`-Skript hat dabei bei **jedem** Start ein `db push --accept-data-loss` und **Seed** ausgeführt — das ist für eine echte Datenbank unbrauchbar und kann Daten gefährden.

- **Produktion / Plesk:** `npm start` → nur `next start` (bindet standardmäßig an `0.0.0.0`, Port über `PORT` oder `-p`).
- **Optional (nur wenn du genau das willst, z. B. Demo):**  
  `npm run start:with-migrate-and-seed`

Schema/Seed für die **erste** Einrichtung einmal per SSH ausführen, nicht im Startbefehl:

```bash
npm run db:push
npm run db:seed
```

## Warum Plesk nach einer „komischen“ `server.js` verlangt

Die **Node.js-Anwendungs**-Maske ist für klassische Apps gebaut (eine `.js`-Datei, oft **Application Startup File:** `server.js`). **Next.js** hat keinen solchen Einstieg aus dem Repo – Produktion ist **`npm run build`** und dann **`next start`** über die eingebaute CLI.

Üblich sind zwei Varianten:

- **Startup-Datei** wie im Repo: **`start.js`** (gleicher Start wie `next start`; **Port** weiter über **`PORT`**, wie Plesk ihn setzt). In der Plesk-Maske **Application Startup File** auf **`start.js`** setzen — nicht einen leeren `server.js` verwenden.
- Oder dort, wo unterstützt: Start über **`npm`** / **`start`** ohne eigene `.js`-Datei.

Siehe auch: [Tenbyte – Next.js 15 & 16 auf Plesk](https://tenbyte.de/blog/run-next-js-15-and-16-on-plesk-with-nodejs); für **Static Assets**: **Document Root** oft auf **`…/PfadProjekt/.next/static`** (relativ zum Anwendungsstamm).

Bei weißer/leerer Seite oder kaputten CSS-Dateien: Document Root `.next/static` prüfen. In **Apache & nginx** evtl. **Proxy-Modus** für die Domain wie in der [Plesk-Doku zu Next.js](https://support.plesk.com/hc/en-us/articles/16950957557783).

## Checkliste Plesk

1. **Node.js 22** im Plesk-Abonnement aktivieren (passend zu `"engines": { "node": "22.x" }` in `package.json`).
2. **Anwendungsstamm** = Verzeichnis mit `package.json` (z. B. Git-Checkout oder Upload dieses Ordners — **ohne** Windows-`node_modules` von zu Hause).
3. **Installation auf dem Server** (Linux), damit Prisma/Native-Module für **Linux** gebaut werden:
   - `npm ci` oder `npm install`
   - nicht `node_modules` von Windows hochladen.
4. **Umgebungsvariablen** in Plesk (Domain → Node.js / Umgebungsvariablen), mindestens:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - ggf. weitere aus `.env.example`
5. **Build** auf dem Server (nach Pull/Upload):
   - `npm run build`
6. **Start:** Entweder **Application Startup File** = **`start.js`** (wie in diesem Repo) **oder**, falls die Oberfläche es hergibt, **`npm`** mit Script **`start`**. **`PORT`** setzt Plesk meist automatisch — `start.js` liest ihn (nicht einen festen Port hardcodieren).

## Datenbank

MySQL/MariaDB muss für die App erreichbar sein (bei vielen Hosting-Paketen **localhost** und Port **3306** mit Nutzer wie in der Plesk-DB-Verwaltung angelegt).

## Kurz: Deploy-Zyklus

```bash
git pull origin main    # oder dein Branch
npm ci
npm run build
# App in Plesk neu starten (Button / „restart“)
```

Bei Schema-Änderungen: erst `npm run db:push` oder Migrationsworkflow, dann wieder bauen/neu starten — nicht alles automatisch beim `npm start`.
