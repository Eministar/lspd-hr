#!/usr/bin/env bash
#
# deploy-server.sh — Auto-Deploy auf dem Linux-Server (screen-basiert).
#
# Wird per SSH vom GitHub-Actions-Workflow (.github/workflows/deploy.yml)
# ausgeführt und über stdin hereingepiped, damit immer die AKTUELLE Version
# des Skripts läuft (nicht die alte auf dem Server).
#
# Erwartet die Env-Variable APP_DIR (Pfad zum Anwendungsstamm auf dem Server).
# Optional: SCREEN_NAME (Default: LSPDPANEL).
#
# Sicherheits-Design:
#   - DB-Backup VOR allem anderen.
#   - `prisma db push` OHNE --accept-data-loss: additive Änderungen laufen durch,
#     destruktive brechen den Deploy ab (kein stiller Datenverlust).
#   - Build läuft, während die alte App noch bedient; Neustart erst ganz am Ende
#     → minimale Downtime.

set -euo pipefail

APP_DIR="${APP_DIR:?APP_DIR ist nicht gesetzt}"
SCREEN_NAME="${SCREEN_NAME:-LSPDPANEL}"
BRANCH="${DEPLOY_BRANCH:-main}"

log() { printf '\n\033[36m=== %s ===\033[0m\n' "$1"; }

log "Wechsel ins App-Verzeichnis: $APP_DIR"
cd "$APP_DIR"

log "DB-Backup"
npm run db:backup

log "Code aktualisieren (git reset --hard origin/$BRANCH)"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

log "Dependencies installieren (npm ci)"
npm ci

log "Prisma-Client generieren"
npx prisma generate

log "Schema anwenden (prisma db push, ohne --accept-data-loss)"
# Bricht bewusst ab, wenn der Push destruktiv wäre → dann manuell eingreifen.
npx prisma db push

# Optionaler Seed — NUR wenn RUN_SEED=1 (z.B. update.sh --seed). Standardmäßig
# aus, weil der Seed Gruppen-/Unit-Rechte auf die Defaults zurücksetzen würde.
if [ "${RUN_SEED:-0}" = "1" ]; then
  log "Seed (RUN_SEED=1)"
  npm run db:seed
fi

log "Build"
npm run build

log "App neu starten (screen: $SCREEN_NAME)"
# Alte Session sauber beenden (Fehler ignorieren, falls keine läuft).
screen -S "$SCREEN_NAME" -X quit || true
# Kurz warten, damit der Port freigegeben wird.
sleep 2
screen -dmS "$SCREEN_NAME" npm run start

log "Deploy fertig — Screen-Sessions:"
screen -ls || true
