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
6. **Startbefehl** in Plesk: `npm run start` (oder das, was die Oberfläche für „npm script“ erwartet — oft `npm` mit Argument `start`).
7. **`PORT`** setzt Plesk/Reverse-Proxy oft selbst — Next.js liest **`PORT`**; falls nötig den Port aus der Plesk-Doku übernehmen.

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
