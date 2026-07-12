#!/usr/bin/env bash
#
# update.sh — manuelles Server-Update. Einfach auf dem Server im App-Ordner:
#
#   bash scripts/update.sh              # normales Update (pull, build, migrate, restart)
#   bash scripts/update.sh --seed       # zusätzlich Seed (einmalig: importiert bestehende
#                                        #   Ordnungen; ACHTUNG: setzt Gruppen-/Unit-Rechte
#                                        #   auf die Seed-Defaults zurück!)
#   bash scripts/update.sh --branch dev # anderen Branch deployen (Default: main)
#
# Erkennt den App-Ordner selbst (Elternverzeichnis dieses Skripts) und ruft dann
# den gemeinsamen Deploy-Ablauf (deploy-server.sh) auf. Ablauf dort:
#   DB-Backup → git reset --hard origin/<branch> → npm ci → prisma generate →
#   prisma db push (ohne --accept-data-loss) → [optional Seed] → build →
#   screen LSPDPANEL neu starten.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RUN_SEED=0
DEPLOY_BRANCH="main"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --seed) RUN_SEED=1; shift ;;
    --branch) DEPLOY_BRANCH="${2:?--branch braucht einen Wert}"; shift 2 ;;
    -h|--help)
      sed '1d' "${BASH_SOURCE[0]}" | grep '^#' | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 1 ;;
  esac
done

export APP_DIR RUN_SEED DEPLOY_BRANCH

# Wichtig: deploy-server.sh liegt im Repo und wird von `git reset --hard`
# mitten im Lauf überschrieben. Bash liest Skripte fortlaufend aus der Datei —
# würde die Datei sich darunter ändern, führt das zu Fehlern. Deshalb in eine
# stabile temporäre Kopie ausführen.
TMP_DEPLOY="$(mktemp)"
cp "$SCRIPT_DIR/deploy-server.sh" "$TMP_DEPLOY"
exec bash "$TMP_DEPLOY"
